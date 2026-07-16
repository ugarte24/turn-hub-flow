import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { fetchServicePoints, fetchTodayTickets } from "@/lib/sigat-queries";
import { callNextTicket, updateTicketStatus } from "@/lib/sigat.functions";
import { formatTicketCode } from "@/lib/ticket-code";
import { toast } from "sonner";
import { PhoneCall, RefreshCcw, UserX, CheckCircle2, XCircle, PlayCircle, Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/operator")({
  head: () => ({ meta: [{ title: "Puesto de atención — SIGAT" }] }),
  component: OperatorPage,
});

type TicketRow = {
  id: string; code: string; ci: string; status: string;
  created_at: string; called_at: string | null;
  area?: { name: string } | null; procedure?: { name: string } | null;
  service_point_id: string | null; operator_id: string | null;
};

function OperatorPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();

  const sps = useQuery({ queryKey: ["service_points"], queryFn: fetchServicePoints });
  const tickets = useQuery({ queryKey: ["today_tickets"], queryFn: fetchTodayTickets });

  const callFn = useServerFn(callNextTicket);
  const upFn = useServerFn(updateTicketStatus);

  // Limpia selección manual antigua
  useEffect(() => {
    localStorage.removeItem("sigat_sp");
  }, []);

  useEffect(() => {
    const ch = supabase
      .channel("op-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => {
        qc.invalidateQueries({ queryKey: ["today_tickets"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const assignedSp = useMemo(() => {
    const points = sps.data ?? [];
    return points.find((p) => p.operator_id === user.id && p.active)
      ?? points.find((p) => p.operator_id === user.id)
      ?? null;
  }, [sps.data, user.id]);

  const spId = assignedSp?.id ?? null;

  const callNext = useMutation({
    mutationFn: async () => callFn({ data: { servicePointId: spId! } }),
    onSuccess: (t) => {
      if (!t) toast.info("No hay turnos en espera para este puesto");
      else toast.success(`Llamando ${formatTicketCode((t as { code: string }).code)}`);
      qc.invalidateQueries({ queryKey: ["today_tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doUpdate = useMutation({
    mutationFn: async (p: { id: string; status: "calling" | "in_service" | "finished" | "absent" | "cancelled" }) =>
      upFn({ data: { ticketId: p.id, status: p.status } }),
    onSuccess: (_t, p) => {
      qc.invalidateQueries({ queryKey: ["today_tickets"] });
      if (p.status === "calling") toast.success("Llamado repetido en pantalla TV");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const myCalling = useMemo(
    () => (tickets.data as TicketRow[] | undefined)?.find(
      (t) => t.service_point_id === spId && t.operator_id === user.id && (t.status === "calling" || t.status === "in_service"),
    ) ?? null,
    [tickets.data, spId, user.id],
  );

  const queueCount = useMemo(() => (tickets.data as TicketRow[] | undefined)?.filter((t) => t.status === "waiting").length ?? 0, [tickets.data]);

  if (sps.isLoading) {
    return (
      <div className="mx-auto max-w-lg p-6 md:p-10">
        <p className="text-sm text-muted-foreground">Cargando puesto de atención…</p>
      </div>
    );
  }

  if (!assignedSp) {
    return (
      <div className="mx-auto max-w-lg p-6 md:p-10">
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <Building2 className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-bold">Sin puesto asignado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tu usuario no tiene un puesto de atención vinculado. Un administrador debe asignarte uno en la sección Puestos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Puesto de atención</p>
        <h1 className="text-3xl font-extrabold">{assignedSp.name}</h1>
        {!assignedSp.active && (
          <p className="mt-1 text-sm text-destructive">Este puesto está inactivo.</p>
        )}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Stat label="En espera" value={queueCount} />
        <Stat label="Mi turno actual" value={myCalling ? formatTicketCode(myCalling.code) : "—"} />
        <Stat label="Estado" value={myCalling ? (myCalling.status === "calling" ? "Llamando" : "En atención") : "Libre"} />
      </div>

      {myCalling ? (
        <div className="mt-6 rounded-3xl border-2 border-primary/40 bg-gradient-to-b from-primary/5 to-transparent p-8">
          <div className="text-center">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Ticket actual</p>
            <p className="mt-2 font-ticket text-7xl font-black text-primary">{formatTicketCode(myCalling.code)}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 text-sm">
              <span className="rounded-full bg-accent px-3 py-1 font-medium">{myCalling.area?.name}</span>
              <span className="rounded-full bg-accent px-3 py-1 font-medium">{myCalling.procedure?.name}</span>
              <span className="rounded-full border border-border px-3 py-1">CI: {myCalling.ci}</span>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
            <ActionBtn onClick={() => doUpdate.mutate({ id: myCalling.id, status: "calling" })} icon={RefreshCcw} label="Repetir llamado" />
            {myCalling.status === "calling" && (
              <ActionBtn primary onClick={() => doUpdate.mutate({ id: myCalling.id, status: "in_service" })} icon={PlayCircle} label="Iniciar atención" />
            )}
            <ActionBtn variant="success" onClick={() => doUpdate.mutate({ id: myCalling.id, status: "finished" })} icon={CheckCircle2} label="Finalizar" />
            <ActionBtn variant="warning" onClick={() => doUpdate.mutate({ id: myCalling.id, status: "absent" })} icon={UserX} label="Ausente" />
            <ActionBtn variant="destructive" onClick={() => doUpdate.mutate({ id: myCalling.id, status: "cancelled" })} icon={XCircle} label="Cancelar" />
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-3xl border border-dashed border-border p-10 text-center">
          <p className="text-lg text-muted-foreground">No estás atendiendo a nadie</p>
          <button
            onClick={() => callNext.mutate()}
            disabled={callNext.isPending || !assignedSp.active}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-primary px-8 py-3.5 text-lg font-semibold text-primary-foreground shadow-elegant hover:brightness-105 disabled:opacity-50"
          >
            <PhoneCall className="h-5 w-5" /> {callNext.isPending ? "Llamando..." : "Llamar siguiente"}
          </button>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Cola del día</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Turno</th>
                <th className="px-4 py-2">Trámite</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Puesto</th>
              </tr>
            </thead>
            <tbody>
              {((tickets.data as TicketRow[] | undefined) ?? []).slice(0, 20).map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-4 py-2 font-ticket font-bold">{formatTicketCode(t.code)}</td>
                  <td className="px-4 py-2">{t.procedure?.name}</td>
                  <td className="px-4 py-2"><StatusPill s={t.status} /></td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {(t as unknown as { service_point?: { name: string } }).service_point?.name ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-extrabold">{value}</p>
    </div>
  );
}

function ActionBtn({ onClick, icon: Icon, label, primary, variant }: { onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string; primary?: boolean; variant?: "success" | "warning" | "destructive" }) {
  const cls =
    primary ? "bg-gradient-primary text-primary-foreground shadow-elegant hover:brightness-105"
    : variant === "success" ? "bg-success text-success-foreground hover:brightness-105"
    : variant === "warning" ? "bg-warning text-warning-foreground hover:brightness-105"
    : variant === "destructive" ? "bg-destructive text-destructive-foreground hover:brightness-105"
    : "border border-border bg-background hover:bg-accent";
  return (
    <button onClick={onClick} className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition ${cls}`}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

function StatusPill({ s }: { s: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    waiting: { label: "En espera", cls: "bg-muted text-foreground" },
    calling: { label: "Llamando", cls: "bg-warning/20 text-warning-foreground" },
    in_service: { label: "En atención", cls: "bg-primary/15 text-primary" },
    finished: { label: "Finalizado", cls: "bg-success/15 text-success" },
    absent: { label: "Ausente", cls: "bg-destructive/10 text-destructive" },
    cancelled: { label: "Cancelado", cls: "bg-destructive/10 text-destructive" },
  };
  const m = map[s] ?? { label: s, cls: "bg-muted" };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>;
}
