import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Public server client (anon)
function publicClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
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
    const { data: row, error } = await sb.rpc("generate_ticket", {
      _ci: data.ci,
      _area_id: data.areaId,
      _procedure_id: data.procedureId,
    });
    if (error) throw new Error(error.message);
    return row as unknown as Record<string, string | number | boolean | null>;
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

export const cancelTicketByCi = createServerFn({ method: "POST" })
  .inputValidator((d: { ci: string; ticketId: string }) =>
    z.object({ ci: z.string().trim().min(4).max(20), ticketId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: t } = await sb.from("tickets").select("*").eq("id", data.ticketId).maybeSingle();
    if (!t || t.ci !== data.ci) throw new Error("Ticket no encontrado");
    if (t.status !== "waiting") throw new Error("Solo se puede cancelar en estado En espera");
    const { error } = await sb.from("tickets").update({ status: "cancelled" }).eq("id", data.ticketId);
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

    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/La_Paz" }))
      .toISOString().slice(0, 10);

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
    const patch: { status: typeof data.status; started_at?: string; finished_at?: string } = { status: data.status };
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
  .inputValidator((d: { email: string; password: string; fullName: string; role: "admin" | "operator" }) =>
    z.object({
      email: z.string().email().max(200),
      password: z.string().min(6).max(100),
      fullName: z.string().trim().min(2).max(120),
      role: z.enum(["admin", "operator"]),
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
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/La_Paz" })).toISOString().slice(0, 10);
    await supabase.from("daily_counters").delete().eq("day", today);
    return { ok: true };
  });
