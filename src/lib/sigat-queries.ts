import { supabase } from "@/integrations/supabase/client";

export type Area = { id: string; code: string; name: string; active: boolean; sort_order: number };
export type Procedure = { id: string; area_id: string; name: string; active: boolean; sort_order: number };
export type Ticket = {
  id: string; day: string; number: number; code: string; ci: string;
  area_id: string; procedure_id: string; status: string;
  service_point_id: string | null; operator_id: string | null;
  created_at: string; called_at: string | null; started_at: string | null; finished_at: string | null;
};
export type ServicePoint = { id: string; name: string; active: boolean; operator_id: string | null };

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
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/La_Paz" })).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("tickets")
    .select("*, area:areas(*), procedure:procedures(*), service_point:service_points(*)")
    .eq("day", today)
    .order("created_at", { ascending: false });
  return data ?? [];
}
