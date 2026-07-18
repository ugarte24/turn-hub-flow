import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSupabaseUrlAndAnon } from "@/integrations/supabase/env";
import { todayLaPaz } from "@/lib/date";

// ---------- Device identity (cookie) ----------
const DEVICE_COOKIE = "sigat_device";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads the device cookie; creates and sets it if missing. */
function getOrCreateDeviceId(): string {
  const existing = getCookie(DEVICE_COOKIE);
  if (existing && UUID_RE.test(existing)) return existing;
  const id = crypto.randomUUID();
  setCookie(DEVICE_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}

/** Reads the device cookie without creating it. */
function getDeviceId(): string | null {
  const existing = getCookie(DEVICE_COOKIE);
  return existing && UUID_RE.test(existing) ? existing : null;
}

// Public server client (anon)
function publicClient() {
  const { url, key } = requireSupabaseUrlAndAnon();
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

// ---------- PUBLIC: ticket generation ----------
export const generateTicket = createServerFn({ method: "POST" })
  .inputValidator((d: { ci: string; areaId: string; procedureId: string }) =>
    z.object({
      ci: z.string().trim().min(4).max(20).regex(/^[0-9A-Za-z-]+$/),
      areaId: z.string().uuid(),
      procedureId: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    const deviceId = getOrCreateDeviceId();
    const { data: row, error } = await sb.rpc("generate_ticket", {
      _ci: data.ci,
      _area_id: data.areaId,
      _procedure_id: data.procedureId,
      _device_id: deviceId,
    });
    if (error) throw new Error(error.message);
    const ticket = (Array.isArray(row) ? row[0] : row) as { id?: string } | null;
    if (!ticket?.id) return row;

    const { data: full, error: fetchError } = await sb
      .from("tickets")
      .select("*, area:areas(*), procedure:procedures(*)")
      .eq("id", ticket.id)
      .single();
    if (fetchError) throw new Error(fetchError.message);
    return full;
  });

/** Active ticket issued from this device (any CI). Used to warn before replacing it. */
export const findActiveTicketByDevice = createServerFn({ method: "POST" }).handler(async () => {
  const deviceId = getDeviceId();
  if (!deviceId) return null;
  const sb = publicClient();
  const { data: t } = await sb
    .from("tickets")
    .select("*, area:areas(*), procedure:procedures(*)")
    .eq("device_id", deviceId)
    .in("status", ["waiting", "calling", "in_service"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return t;
});

// ---------- HOST (Personal de apoyo): generate tickets on behalf of citizens ----------
export const generateTicketAsStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ci: string; areaId: string; procedureId: string }) =>
    z.object({
      ci: z.string().trim().min(4).max(20).regex(/^[0-9A-Za-z-]+$/),
      areaId: z.string().uuid(),
      procedureId: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: isHost }, { data: isAdmin }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "host" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    ]);
    if (!isHost && !isAdmin) throw new Error("Solo el personal de apoyo puede usar esta función");

    // Sin _device_id: los turnos del mostrador no se cancelan entre sí
    const { data: row, error } = await supabase.rpc("generate_ticket", {
      _ci: data.ci,
      _area_id: data.areaId,
      _procedure_id: data.procedureId,
    });
    if (error) throw new Error(error.message);
    const ticket = (Array.isArray(row) ? row[0] : row) as { id?: string } | null;
    if (!ticket?.id) return row;

    const { data: full, error: fetchError } = await supabase
      .from("tickets")
      .select("*, area:areas(*), procedure:procedures(*)")
      .eq("id", ticket.id)
      .single();
    if (fetchError) throw new Error(fetchError.message);
    return full;
  });

export const findActiveTicketByCi = createServerFn({ method: "POST" })
  .inputValidator((d: { ci: string }) => z.object({ ci: z.string().trim().min(4).max(20) }).parse(d))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: t } = await sb
      .from("tickets")
      .select("*, area:areas(*), procedure:procedures(*)")
      .eq("ci", data.ci)
      .in("status", ["waiting", "calling", "in_service"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return t;
  });

/** Latest finished ticket today that has not been rated yet. */
export const findRateableTicketByCi = createServerFn({ method: "POST" })
  .inputValidator((d: { ci: string }) => z.object({ ci: z.string().trim().min(4).max(20) }).parse(d))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const today = todayLaPaz();
    const { data: finished } = await sb
      .from("tickets")
      .select("*, area:areas(*), procedure:procedures(*)")
      .eq("ci", data.ci)
      .eq("status", "finished")
      .eq("day", today)
      .order("finished_at", { ascending: false })
      .limit(10);

    if (!finished?.length) return null;

    const ids = finished.map((t) => t.id);
    const { data: rated } = await sb.from("ticket_ratings").select("ticket_id").in("ticket_id", ids);
    const ratedIds = new Set((rated ?? []).map((r) => r.ticket_id));
    return finished.find((t) => !ratedIds.has(t.id)) ?? null;
  });

export const submitTicketRating = createServerFn({ method: "POST" })
  .inputValidator((d: { ci: string; ticketId: string; score: number; comment?: string }) =>
    z.object({
      ci: z.string().trim().min(4).max(20),
      ticketId: z.string().uuid(),
      score: z.number().int().min(1).max(5),
      comment: z.string().trim().max(400).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: row, error } = await sb.rpc("submit_ticket_rating", {
      _ci: data.ci,
      _ticket_id: data.ticketId,
      _score: data.score,
      _comment: data.comment ?? null,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const cancelTicketByCi = createServerFn({ method: "POST" })
  .inputValidator((d: { ci: string; ticketId: string }) =>
    z.object({ ci: z.string().trim().min(4).max(20), ticketId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { error } = await sb.rpc("cancel_ticket", { _ci: data.ci, _ticket_id: data.ticketId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- OPERATOR ----------
export const callNextTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { servicePointId: string }) => z.object({ servicePointId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // procedures for this SP
    const { data: sp } = await supabase
      .from("service_point_procedures")
      .select("procedure_id")
      .eq("service_point_id", data.servicePointId);
    const procIds = (sp ?? []).map((r) => r.procedure_id);
    if (procIds.length === 0) throw new Error("Este puesto no tiene trámites asignados");

    const today = todayLaPaz();

    const { data: next } = await supabase
      .from("tickets")
      .select("*")
      .eq("status", "waiting")
      .eq("day", today)
      .in("procedure_id", procIds)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!next) return null;

    const { data: updated, error } = await supabase
      .from("tickets")
      .update({
        status: "calling",
        service_point_id: data.servicePointId,
        operator_id: userId,
        called_at: new Date().toISOString(),
      })
      .eq("id", next.id)
      .eq("status", "waiting")
      .select("*, area:areas(*), procedure:procedures(*), service_point:service_points(*)")
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

export const updateTicketStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticketId: string; status: "calling" | "in_service" | "finished" | "absent" | "cancelled" }) =>
    z.object({
      ticketId: z.string().uuid(),
      status: z.enum(["calling", "in_service", "finished", "absent", "cancelled"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: {
      status: typeof data.status;
      started_at?: string;
      finished_at?: string;
      called_at?: string;
    } = { status: data.status };
    // Repetir llamado / re-llamar: refresca called_at para que la TV anuncie de nuevo
    if (data.status === "calling") patch.called_at = new Date().toISOString();
    if (data.status === "in_service") patch.started_at = new Date().toISOString();
    if (data.status === "finished" || data.status === "absent" || data.status === "cancelled")
      patch.finished_at = new Date().toISOString();
    const { data: t, error } = await supabase.from("tickets").update(patch).eq("id", data.ticketId).select().single();
    if (error) throw new Error(error.message);
    return t;
  });

// ---------- ADMIN: user management ----------
export const listOperators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores");
    const { data } = await supabase.from("profiles").select("id, full_name, active, created_at");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    return (data ?? []).map((p) => ({
      ...p,
      roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
    }));
  });

export const createOperator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; password: string; fullName: string; role: "admin" | "operator" | "host" }) =>
    z.object({
      email: z.string().email().max(200),
      password: z.string().min(6).max(100),
      fullName: z.string().trim().min(2).max(120),
      role: z.enum(["admin", "operator", "host"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error) throw new Error(error.message);
    const uid = created.user!.id;
    await supabaseAdmin.from("profiles").upsert({ id: uid, full_name: data.fullName, active: true });
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });
    return { id: uid };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; active: boolean }) =>
    z.object({ userId: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores");
    await supabase.from("profiles").update({ active: data.active }).eq("id", data.userId);
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores");
    if (data.userId === userId) throw new Error("No puedes eliminarte a ti mismo");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.auth.admin.deleteUser(data.userId);
    return { ok: true };
  });

// ---------- ADMIN: service points ----------
export const upsertServicePoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; name: string; active: boolean; operatorId?: string | null; procedureIds: string[] }) =>
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().trim().min(2).max(100),
      active: z.boolean(),
      operatorId: z.string().uuid().nullable().optional(),
      procedureIds: z.array(z.string().uuid()),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores");
    let spId = data.id;
    if (spId) {
      await supabase.from("service_points").update({
        name: data.name, active: data.active, operator_id: data.operatorId ?? null,
      }).eq("id", spId);
    } else {
      const { data: created, error } = await supabase.from("service_points").insert({
        name: data.name, active: data.active, operator_id: data.operatorId ?? null,
      }).select("id").single();
      if (error) throw new Error(error.message);
      spId = created.id;
    }
    await supabase.from("service_point_procedures").delete().eq("service_point_id", spId);
    if (data.procedureIds.length) {
      await supabase.from("service_point_procedures").insert(
        data.procedureIds.map((pid) => ({ service_point_id: spId!, procedure_id: pid })),
      );
    }
    return { id: spId };
  });

export const deleteServicePoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores");
    await supabase.from("service_points").delete().eq("id", data.id);
    return { ok: true };
  });

// ---------- ADMIN: bootstrap first admin ----------
export const bootstrapFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { count } = await supabase.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) > 0) return { ok: false, reason: "already_bootstrapped" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "admin" });
    return { ok: true };
  });

// ---------- ADMIN: areas ----------
export const upsertArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; code: string; name: string; active: boolean }) =>
    z.object({
      id: z.string().uuid().optional(),
      code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,3}$/, "Código de 1 a 3 letras/números"),
      name: z.string().trim().min(2).max(120),
      active: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores");

    const { data: dup } = await supabase
      .from("areas")
      .select("id")
      .eq("code", data.code)
      .maybeSingle();
    if (dup && dup.id !== data.id) throw new Error(`Ya existe un área con código ${data.code}`);

    if (data.id) {
      const { error } = await supabase.from("areas").update({
        code: data.code, name: data.name, active: data.active,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { data: last } = await supabase
        .from("areas")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const sort_order = (last?.sort_order ?? 0) + 1;
      const { error } = await supabase.from("areas").insert({
        code: data.code, name: data.name, active: data.active, sort_order,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores");
    const { count } = await supabase
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("area_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Error("No se puede eliminar: hay tickets asociados. Desactiva el área en su lugar.");
    }
    const { error } = await supabase.from("areas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- ADMIN: procedures ----------
export const upsertProcedure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; areaId: string; name: string; active: boolean }) =>
    z.object({
      id: z.string().uuid().optional(),
      areaId: z.string().uuid(),
      name: z.string().trim().min(2).max(120),
      active: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores");
    if (data.id) {
      await supabase.from("procedures").update({ name: data.name, active: data.active, area_id: data.areaId }).eq("id", data.id);
    } else {
      await supabase.from("procedures").insert({ name: data.name, active: data.active, area_id: data.areaId });
    }
    return { ok: true };
  });

export const deleteProcedure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores");
    await supabase.from("procedures").delete().eq("id", data.id);
    return { ok: true };
  });

// ---------- ADMIN: reset counters ----------
export const resetDailyCounters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores");
    const today = todayLaPaz();
    await supabase.from("daily_counters").delete().eq("day", today);
    return { ok: true };
  });
