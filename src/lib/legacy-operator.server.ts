import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseUrlAndAnon } from "@/integrations/supabase/env";
import { todayLaPaz } from "@/lib/date";

type Db = SupabaseClient<Database>;

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (
      (supabaseKey.startsWith("sb_publishable_") || supabaseKey.startsWith("sb_secret_")) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function publicSupabase() {
  const { url, key } = requireSupabaseUrlAndAnon();
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: createSupabaseFetch(key) },
  });
}

export function userSupabaseFromRequest(request: Request): { supabase: Db; token: string } | { error: Response } {
  const { url, key } = requireSupabaseUrlAndAnon();
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: jsonError("No autorizado", 401) };
  }
  const token = authHeader.slice(7).trim();
  if (!token || token.split(".").length !== 3) {
    return { error: jsonError("Token inválido", 401) };
  }
  const supabase = createClient<Database>(url, key, {
    global: {
      fetch: createSupabaseFetch(key),
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  return { supabase, token };
}

export async function requireUserId(supabase: Db): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

function resolveSpKind(sp: { kind?: string | null; name: string }): "standard" | "ruat" | "counter" | "cashier" {
  if (sp.kind === "ruat" || sp.kind === "counter" || sp.kind === "cashier" || sp.kind === "standard") return sp.kind;
  const n = sp.name.toLowerCase();
  if (n.includes("ventanilla")) return "counter";
  if (n.includes("caja")) return "cashier";
  if (n.includes("ruat") || n.includes("jefe")) return "ruat";
  return "standard";
}

export function formatTicketCodeLegacy(code: string | null | undefined): string {
  if (!code) return "—";
  const m = /^([A-Za-z0-9]+)-(\d+)$/.exec(code.trim());
  if (!m) return code;
  return `${m[1].toUpperCase()}${parseInt(m[2], 10)}`;
}

export async function findAssignedServicePoint(supabase: Db, userId: string) {
  const { data: points } = await supabase.from("service_points").select("*").order("name");
  const list = points ?? [];
  const assigned =
    list.find((p) => p.operator_id === userId && p.active) ??
    list.find((p) => p.operator_id === userId) ??
    null;
  return assigned;
}

export async function callNextForOperator(supabase: Db, userId: string, servicePointId: string) {
  const { data: spRow, error: spErr } = await supabase
    .from("service_points")
    .select("*")
    .eq("id", servicePointId)
    .single();
  if (spErr || !spRow) throw new Error("Puesto no encontrado");
  if (spRow.operator_id && spRow.operator_id !== userId) {
    throw new Error("Este puesto no está asignado a tu usuario");
  }

  const kind = resolveSpKind(spRow as { kind?: string | null; name: string });
  const { data: sp } = await supabase
    .from("service_point_procedures")
    .select("procedure_id")
    .eq("service_point_id", servicePointId);
  const procIds = (sp ?? []).map((r) => r.procedure_id);
  const today = todayLaPaz();

  type TicketPick = { id: string };
  let next: TicketPick | null = null;

  if (kind === "ruat") {
    const { data: returning } = await supabase
      .from("tickets")
      .select("id")
      .eq("status", "waiting")
      .eq("day", today)
      .eq("transfer_to", "origin")
      .eq("origin_service_point_id", servicePointId)
      .order("preferential", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    next = returning;
  }

  if (!next && kind === "ruat") {
    const { data: forRuat } = await supabase
      .from("tickets")
      .select("id")
      .eq("status", "waiting")
      .eq("day", today)
      .eq("transfer_to", "ruat")
      .order("preferential", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    next = forRuat;
  }

  if (!next && kind === "counter") {
    const { data: forCounter } = await supabase
      .from("tickets")
      .select("id")
      .eq("status", "waiting")
      .eq("day", today)
      .eq("transfer_to", "counter")
      .order("preferential", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    next = forCounter;
  }

  if (!next && kind === "cashier") {
    const { data: forCashier } = await supabase
      .from("tickets")
      .select("id")
      .eq("status", "waiting")
      .eq("day", today)
      .eq("transfer_to", "cashier")
      .order("preferential", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    next = forCashier;
  }

  if (!next) {
    if (procIds.length === 0) {
      if (kind === "counter" || kind === "ruat" || kind === "cashier") return null;
      throw new Error("Este puesto no tiene trámites asignados");
    }
    const { data: normal } = await supabase
      .from("tickets")
      .select("id")
      .eq("status", "waiting")
      .eq("day", today)
      .in("procedure_id", procIds)
      .is("transfer_to", null)
      .order("preferential", { ascending: false })
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
      service_point_id: servicePointId,
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
}

export async function updateTicketStatusLegacy(
  supabase: Db,
  ticketId: string,
  status: "calling" | "finished" | "absent" | "cancelled",
) {
  const patch: Record<string, unknown> = { status };
  if (status === "calling") patch.called_at = new Date().toISOString();
  if (status === "finished" || status === "absent" || status === "cancelled") {
    patch.finished_at = new Date().toISOString();
    patch.transfer_to = null;
    patch.origin_service_point_id = null;
    patch.origin_operator_id = null;
  }
  const { data: t, error } = await supabase
    .from("tickets")
    .update(patch as never)
    .eq("id", ticketId)
    .select("*, area:areas(*), procedure:procedures(*)")
    .single();
  if (error) throw new Error(error.message);
  return t;
}

export async function getOperatorState(supabase: Db, userId: string) {
  const assigned = await findAssignedServicePoint(supabase, userId);
  const today = todayLaPaz();
  const { data: tickets } = await supabase
    .from("tickets")
    .select("*, area:areas(*), procedure:procedures(*), service_point:service_points!service_point_id(*)")
    .eq("day", today)
    .order("created_at", { ascending: false });

  const list = tickets ?? [];
  const myCalling =
    list.find(
      (t) =>
        t.service_point_id === assigned?.id &&
        t.operator_id === userId &&
        (t.status === "calling" || t.status === "in_service"),
    ) ?? null;

  const kind = assigned ? resolveSpKind(assigned as { kind?: string | null; name: string }) : "standard";
  let queueCount = 0;
  if (assigned) {
    const waiting = list.filter((t) => t.status === "waiting");
    if (kind === "counter") {
      queueCount = waiting.filter((t) => t.transfer_to === "counter").length;
    } else if (kind === "cashier") {
      queueCount = waiting.filter(
        (t) => t.transfer_to === "cashier" || (t.transfer_to == null && /^C-/i.test(t.code)),
      ).length;
    } else     if (kind === "ruat") {
      queueCount = waiting.filter(
        (t) =>
          (t.transfer_to === "origin" && t.origin_service_point_id === assigned.id) ||
          t.transfer_to === "ruat" ||
          t.transfer_to == null,
      ).length;
    } else {
      queueCount = waiting.filter((t) => t.transfer_to == null).length;
    }
  }

  return {
    servicePoint: assigned
      ? {
          id: assigned.id,
          name: assigned.name,
          active: assigned.active,
          kind,
        }
      : null,
    queueCount,
    myCalling: myCalling
      ? {
          id: myCalling.id,
          code: myCalling.code,
          displayCode: formatTicketCodeLegacy(myCalling.code),
          status: myCalling.status,
          area: (myCalling as { area?: { name?: string } | null }).area?.name ?? null,
          procedure: (myCalling as { procedure?: { name?: string } | null }).procedure?.name ?? null,
        }
      : null,
    recent: list.slice(0, 12).map((t) => ({
      id: t.id,
      code: formatTicketCodeLegacy(t.code),
      status: t.status,
      procedure: (t as { procedure?: { name?: string } | null }).procedure?.name ?? "—",
    })),
  };
}
