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
  .inputValidator((d: { areaId: string; procedureId: string }) =>
    z.object({
      areaId: z.string().uuid(),
      procedureId: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    const deviceId = getOrCreateDeviceId();
    const { data: row, error } = await sb.rpc("generate_ticket", {
      _ci: "",
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

/** Active ticket issued from this device. */
export const findActiveTicketByDevice = createServerFn({ method: "POST" }).handler(async () => {
  const deviceId = getDeviceId() ?? getOrCreateDeviceId();
  const sb = publicClient();
  await sb.rpc("expire_stale_tickets");
  const today = todayLaPaz();
  const { data: t } = await sb
    .from("tickets")
    .select("*, area:areas(*), procedure:procedures(*)")
    .eq("device_id", deviceId)
    .eq("day", today)
    .in("status", ["waiting", "calling", "in_service"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return t;
});

// ---------- HOST (Personal de apoyo): generate tickets on behalf of citizens ----------
export const generateTicketAsStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { areaId: string; procedureId: string }) =>
    z.object({
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

    // Sin _device_id: el mostrador puede generar varios turnos seguidos
    const { data: row, error } = await supabase.rpc("generate_ticket", {
      _ci: "",
      _area_id: data.areaId,
      _procedure_id: data.procedureId,
      _created_by: userId,
    } as never);
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

/** Latest finished ticket today on this device that has not been rated yet. */
export const findRateableTicketByDevice = createServerFn({ method: "POST" }).handler(async () => {
  const deviceId = getDeviceId();
  if (!deviceId) return null;
  const sb = publicClient();
  await sb.rpc("expire_stale_tickets");
  const today = todayLaPaz();
  const { data: finished } = await sb
    .from("tickets")
    .select("*, area:areas(*), procedure:procedures(*)")
    .eq("device_id", deviceId)
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
  .inputValidator((d: { ticketId: string; score: number; comment?: string }) =>
    z.object({
      ticketId: z.string().uuid(),
      score: z.number().int().min(1).max(5),
      comment: z.string().trim().max(400).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    const deviceId = getDeviceId();
    const { data: row, error } = await sb.rpc("submit_ticket_rating", {
      _ticket_id: data.ticketId,
      _score: data.score,
      _comment: data.comment ?? null,
      _device_id: deviceId,
    } as never);
    if (error) throw new Error(error.message);
    return row;
  });

export const cancelTicketByDevice = createServerFn({ method: "POST" })
  .inputValidator((d: { ticketId: string }) =>
    z.object({ ticketId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    const deviceId = getDeviceId();
    if (!deviceId) throw new Error("Dispositivo no identificado");
    const { error } = await sb.rpc("cancel_ticket", {
      _ticket_id: data.ticketId,
      _device_id: deviceId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- OPERATOR ----------
function resolveSpKind(sp: { kind?: string | null; name: string }): "standard" | "ruat" | "counter" {
  if (sp.kind === "ruat" || sp.kind === "counter" || sp.kind === "standard") return sp.kind;
  const n = sp.name.toLowerCase();
  if (n.includes("ventanilla")) return "counter";
  if (n.includes("ruat")) return "ruat";
  return "standard";
}

export const callNextTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { servicePointId: string }) => z.object({ servicePointId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: spRow, error: spErr } = await supabase
      .from("service_points")
      .select("*")
      .eq("id", data.servicePointId)
      .single();
    if (spErr || !spRow) throw new Error("Puesto no encontrado");
    const kind = resolveSpKind(spRow as { kind?: string | null; name: string });

    const { data: sp } = await supabase
      .from("service_point_procedures")
      .select("procedure_id")
      .eq("service_point_id", data.servicePointId);
    const procIds = (sp ?? []).map((r) => r.procedure_id);

    const today = todayLaPaz();
    type TicketPick = { id: string };
    let next: TicketPick | null = null;

    // RUAT: primero turnos que vuelven a este mismo puesto
    if (kind === "ruat") {
      const { data: returning } = await supabase
        .from("tickets")
        .select("id")
        .eq("status", "waiting")
        .eq("day", today)
        .eq("transfer_to", "origin")
        .eq("origin_service_point_id", data.servicePointId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      next = returning;
    }

    // Ventanilla: cualquier turno derivado (la que esté libre)
    if (!next && kind === "counter") {
      const { data: forCounter } = await supabase
        .from("tickets")
        .select("id")
        .eq("status", "waiting")
        .eq("day", today)
        .eq("transfer_to", "counter")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      next = forCounter;
    }

    // Cola normal del puesto (sin derivaciones)
    if (!next) {
      if (procIds.length === 0) {
        if (kind === "counter" || kind === "ruat") return null;
        throw new Error("Este puesto no tiene trámites asignados");
      }
      const { data: normal } = await supabase
        .from("tickets")
        .select("id")
        .eq("status", "waiting")
        .eq("day", today)
        .in("procedure_id", procIds)
        .is("transfer_to", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      next = normal;
    }

    if (!next) return null;

    const { data: updated, error } = await supabase
      .from("tickets")
      .update({
        status: "calling",
        service_point_id: data.servicePointId,
        operator_id: userId,
        called_at: new Date().toISOString(),
        transfer_to: null,
      } as never)
      .eq("id", next.id)
      .eq("status", "waiting")
      .select("*, area:areas(*), procedure:procedures(*), service_point:service_points!service_point_id(*)")
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

/** RUAT deriva el turno en atención a cualquier ventanilla libre. */
export const transferTicketToCounter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticketId: string }) => z.object({ ticketId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ticket, error: tErr } = await supabase.from("tickets").select("*").eq("id", data.ticketId).single();
    if (tErr || !ticket) throw new Error("Ticket no encontrado");
    if (ticket.status !== "calling" && ticket.status !== "in_service") {
      throw new Error("Solo se puede derivar un turno en atención");
    }
    if (ticket.operator_id && ticket.operator_id !== userId) {
      throw new Error("Este turno no está asignado a tu usuario");
    }

    const t = ticket as {
      origin_service_point_id?: string | null;
      origin_operator_id?: string | null;
      service_point_id: string | null;
      operator_id: string | null;
    };
    const originSp = t.origin_service_point_id ?? t.service_point_id;
    const originOp = t.origin_operator_id ?? t.operator_id ?? userId;
    if (!originSp) throw new Error("No se pudo determinar el puesto RUAT de origen");

    const { data: updated, error } = await supabase
      .from("tickets")
      .update({
        status: "waiting",
        transfer_to: "counter",
        origin_service_point_id: originSp,
        origin_operator_id: originOp,
        service_point_id: null,
        operator_id: null,
        called_at: null,
        started_at: null,
        finished_at: null,
      } as never)
      .eq("id", data.ticketId)
      .select("*, area:areas(*), procedure:procedures(*), service_point:service_points!service_point_id(*)")
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

/** Ventanilla devuelve el turno al mismo operador/puesto RUAT de origen. */
export const returnTicketToOrigin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticketId: string }) => z.object({ ticketId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ticket, error: tErr } = await supabase.from("tickets").select("*").eq("id", data.ticketId).single();
    if (tErr || !ticket) throw new Error("Ticket no encontrado");
    if (ticket.status !== "calling" && ticket.status !== "in_service") {
      throw new Error("Solo se puede devolver un turno en atención");
    }
    if (ticket.operator_id && ticket.operator_id !== userId) {
      throw new Error("Este turno no está asignado a tu usuario");
    }

    const originSp = (ticket as { origin_service_point_id?: string | null }).origin_service_point_id;
    if (!originSp) throw new Error("Este turno no tiene un operador RUAT de origen para devolver");

    const { data: updated, error } = await supabase
      .from("tickets")
      .update({
        status: "waiting",
        transfer_to: "origin",
        service_point_id: null,
        operator_id: null,
        called_at: null,
        started_at: null,
        finished_at: null,
      } as never)
      .eq("id", data.ticketId)
      .select("*, area:areas(*), procedure:procedures(*), service_point:service_points!service_point_id(*)")
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
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "calling") patch.called_at = new Date().toISOString();
    if (data.status === "in_service") patch.started_at = new Date().toISOString();
    if (data.status === "finished" || data.status === "absent" || data.status === "cancelled") {
      patch.finished_at = new Date().toISOString();
      patch.transfer_to = null;
      patch.origin_service_point_id = null;
      patch.origin_operator_id = null;
    }
    const { data: t, error } = await supabase.from("tickets").update(patch as never).eq("id", data.ticketId).select().single();
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

export const updateOperator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    userId: string;
    fullName: string;
    role: "admin" | "operator" | "host";
    password?: string;
  }) =>
    z.object({
      userId: z.string().uuid(),
      fullName: z.string().trim().min(2).max(120),
      role: z.enum(["admin", "operator", "host"]),
      password: z.union([z.string().min(6).max(100), z.literal("")]).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores");

    // No permitir quitarte el rol admin a ti mismo
    if (data.userId === userId && data.role !== "admin") {
      throw new Error("No puedes quitarte el rol de administrador a ti mismo");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: data.fullName })
      .eq("id", data.userId);
    if (profileError) throw new Error(profileError.message);

    const authPatch: { user_metadata: { full_name: string }; password?: string } = {
      user_metadata: { full_name: data.fullName },
    };
    if (data.password && data.password.length >= 6) {
      authPatch.password = data.password;
    }
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, authPatch);
    if (authError) throw new Error(authError.message);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (roleError) throw new Error(roleError.message);

    return { ok: true };
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
  .inputValidator((d: {
    id?: string;
    name: string;
    active: boolean;
    kind?: "standard" | "ruat" | "counter";
    operatorId?: string | null;
    procedureIds: string[];
  }) =>
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().trim().min(2).max(100),
      active: z.boolean(),
      kind: z.enum(["standard", "ruat", "counter"]).optional(),
      operatorId: z.string().uuid().nullable().optional(),
      procedureIds: z.array(z.string().uuid()),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores");
    const kind = data.kind ?? (
      data.name.toLowerCase().includes("ventanilla") ? "counter"
        : data.name.toLowerCase().includes("ruat") ? "ruat"
          : "standard"
    );
    let spId = data.id;
    if (spId) {
      await supabase.from("service_points").update({
        name: data.name,
        active: data.active,
        operator_id: data.operatorId ?? null,
        kind,
      } as never).eq("id", spId);
    } else {
      const { data: created, error } = await supabase.from("service_points").insert({
        name: data.name,
        active: data.active,
        operator_id: data.operatorId ?? null,
        kind,
      } as never).select("id").single();
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
