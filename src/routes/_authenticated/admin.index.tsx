import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { fetchServicePoints, fetchTodayRatings, fetchTodayTickets } from "@/lib/sigat-queries";
import { resetDailyCounters } from "@/lib/sigat.functions";
import { Ticket, Users2, Clock, CheckCircle2, UserX, TrendingUp, RotateCcw, Star } from "lucide-react";
import { toast } from "sonner";
import { formatTicketCode } from "@/lib/ticket-code";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Dashboard — SIGAT" }] }),
  component: AdminDashboard,
});

type T = { id: string; status: string; procedure_id: string; service_point_id: string | null; started_at: string | null; finished_at: string | null; procedure?: { name: string } | null; service_point?: { name: string } | null };

function AdminDashboard() {
  const qc = useQueryClient();
  const tickets = useQuery({ queryKey: ["today_tickets"], queryFn: fetchTodayTickets });
  const ratings = useQuery({ queryKey: ["today_ratings"], queryFn: fetchTodayRatings });
  const sps = useQuery({ queryKey: ["service_points"], queryFn: fetchServicePoints });
  const resetFn = useServerFn(resetDailyCounters);

  useEffect(() => {
    const ch = supabase
      .channel("admin-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => {
        qc.invalidateQueries({ queryKey: ["today_tickets"] });
        qc.invalidateQueries({ queryKey: ["today_ratings"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const reset = useMutation({
    mutationFn: async () => resetFn(),
    onSuccess: () => { toast.success("Numeración reiniciada"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = (tickets.data as T[] | undefined) ?? [];
  const ratingList = ratings.data ?? [];
  const stats = useMemo(() => {
    const total = list.length;
    const waiting = list.filter((t) => t.status === "waiting").length;
    const inService = list.filter((t) => t.status === "in_service" || t.status === "calling").length;
    const finished = list.filter((t) => t.status === "finished").length;
    const absent = list.filter((t) => t.status === "absent").length;
    const finishedWithTime = list.filter((t) => t.status === "finished" && t.started_at && t.finished_at);
    const avgSec = finishedWithTime.length
      ? Math.round(finishedWithTime.reduce((acc, t) => acc + (new Date(t.finished_at!).getTime() - new Date(t.started_at!).getTime()), 0) / finishedWithTime.length / 1000)
      : 0;
    const avgScore = ratingList.length
      ? ratingList.reduce((acc, r) => acc + r.score, 0) / ratingList.length
      : 0;
    return { total, waiting, inService, finished, absent, avgSec, avgScore, ratingCount: ratingList.length };
  }, [list, ratingList]);

  const byProc = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of list) {
      const k = t.procedure?.name ?? "—";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [list]);

  const spBusy = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of list) {
      if ((t.status === "calling" || t.status === "in_service") && t.service_point?.name) m.set(t.service_point.name, t.status);
    }
    return m;
  }, [list]);

  return (
    <div className="p-6 md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Dashboard en tiempo real</h1>
          <p className="text-sm text-muted-foreground">Actividad de la jornada actual</p>
        </div>
        <button onClick={() => reset.mutate()} className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:bg-accent">
          <RotateCcw className="h-4 w-4" /> Reiniciar numeración
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <StatCard icon={Ticket} label="Emitidos hoy" value={stats.total} color="primary" />
        <StatCard icon={Clock} label="En espera" value={stats.waiting} color="warning" />
        <StatCard icon={Users2} label="En atención" value={stats.inService} color="primary" />
        <StatCard icon={CheckCircle2} label="Finalizados" value={stats.finished} color="success" />
        <StatCard icon={UserX} label="Ausentes" value={stats.absent} color="destructive" />
        <StatCard icon={TrendingUp} label="Prom. atención" value={stats.avgSec ? `${Math.floor(stats.avgSec / 60)}m ${stats.avgSec % 60}s` : "—"} color="primary" />
        <StatCard
          icon={Star}
          label="Satisfacción"
          value={stats.ratingCount ? `${stats.avgScore.toFixed(1)} ★` : "—"}
          color="success"
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Trámites más solicitados</h2>
          <ul className="mt-4 space-y-2">
            {byProc.length === 0 && <li className="text-sm text-muted-foreground">Sin datos aún</li>}
            {byProc.map(([name, count]) => {
              const max = byProc[0][1];
              return (
                <li key={name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{name}</span>
                    <span className="tabular-nums text-muted-foreground">{count}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-gradient-primary" style={{ width: `${(count / max) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Estado de puestos</h2>
          <ul className="mt-4 grid grid-cols-2 gap-2">
            {(sps.data ?? []).map((sp) => {
              const busy = spBusy.get(sp.name);
              const state = !sp.active ? "Inactivo" : busy ? "Ocupado" : "Activo";
              const cls = !sp.active ? "bg-muted text-muted-foreground" : busy ? "bg-warning/20 text-warning-foreground" : "bg-success/15 text-success";
              return (
                <li key={sp.id} className="flex items-center justify-between rounded-xl border border-border p-3">
                  <span className="text-sm font-medium">{sp.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{state}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Calificaciones de hoy</h2>
            <p className="text-xs text-muted-foreground">
              {stats.ratingCount
                ? `${stats.ratingCount} respuesta${stats.ratingCount === 1 ? "" : "s"} · promedio ${stats.avgScore.toFixed(1)} ★`
                : "Sin calificaciones aún"}
            </p>
          </div>
          <ul className="mt-4 divide-y divide-border">
            {ratingList.length === 0 && (
              <li className="py-6 text-center text-sm text-muted-foreground">
                Cuando un contribuyente finalice su turno e ingrese su CI, podrá calificar la atención.
              </li>
            )}
            {ratingList.slice(0, 12).map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-ticket text-sm font-bold">{formatTicketCode(r.ticket?.code)}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.ticket?.service_point?.name ?? "Sin puesto"} ·{" "}
                    {new Date(r.created_at).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", hour12: false })}
                  </p>
                  {r.comment && <p className="mt-1 text-sm text-foreground/80">{r.comment}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      className={`h-3.5 w-3.5 ${i < r.score ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; color: "primary" | "success" | "warning" | "destructive" }) {
  const colors: Record<string, string> = {
    primary: "bg-gradient-primary text-primary-foreground",
    success: "bg-success text-success-foreground",
    warning: "bg-warning text-warning-foreground",
    destructive: "bg-destructive text-destructive-foreground",
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${colors[color]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
    </div>
  );
}
