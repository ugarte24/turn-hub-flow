import { supabase } from "@/integrations/supabase/client";
import { todayLaPaz } from "@/lib/date";

export type Area = { id: string; code: string; name: string; active: boolean; sort_order: number };
export type Procedure = { id: string; area_id: string; name: string; active: boolean; sort_order: number };
export type ServicePoint = {
  id: string;
  name: string;
  active: boolean;
  operator_id: string | null;
  kind?: "standard" | "ruat" | "counter";
};
export type Ticket = {
  id: string; day: string; number: number; code: string; ci: string;
  area_id: string; procedure_id: string; status: string;
  service_point_id: string | null; operator_id: string | null;
  origin_service_point_id?: string | null;
  origin_operator_id?: string | null;
  transfer_to?: "counter" | "origin" | null;
  created_at: string; called_at: string | null; started_at: string | null; finished_at: string | null;
};

export async function fetchAreas() {
  const { data } = await supabase.from("areas").select("*").eq("active", true).order("sort_order");
  return (data ?? []) as Area[];
}
export async function fetchAllAreas() {
  const { data } = await supabase.from("areas").select("*").order("sort_order");
  return (data ?? []) as Area[];
}
export async function fetchProcedures(areaId?: string) {
  let q = supabase.from("procedures").select("*").eq("active", true).order("sort_order");
  if (areaId) q = q.eq("area_id", areaId);
  const { data } = await q;
  return (data ?? []) as Procedure[];
}
export async function fetchAllProcedures() {
  const { data } = await supabase.from("procedures").select("*").order("sort_order");
  return (data ?? []) as Procedure[];
}
export async function fetchServicePoints() {
  const { data } = await supabase.from("service_points").select("*").order("name");
  return (data ?? []) as ServicePoint[];
}
export async function fetchServicePointProcedures() {
  const { data } = await supabase.from("service_point_procedures").select("*");
  return data ?? [];
}
export async function fetchTodayTickets() {
  const today = todayLaPaz();
  const { data } = await supabase
    .from("tickets")
    .select("*, area:areas(*), procedure:procedures(*), service_point:service_points(*)")
    .eq("day", today)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export type TicketRatingRow = {
  id: string;
  ticket_id: string;
  score: number;
  comment: string | null;
  created_at: string;
  ticket?: { code: string; service_point?: { name: string } | null } | null;
};

export async function fetchTodayRatings() {
  const today = todayLaPaz();
  const { data: tickets } = await supabase.from("tickets").select("id").eq("day", today);
  const ids = (tickets ?? []).map((t) => t.id);
  if (!ids.length) return [] as TicketRatingRow[];
  const { data } = await supabase
    .from("ticket_ratings")
    .select("*, ticket:tickets(code, service_point:service_points(name))")
    .in("ticket_id", ids)
    .order("created_at", { ascending: false });
  return (data ?? []) as TicketRatingRow[];
}
