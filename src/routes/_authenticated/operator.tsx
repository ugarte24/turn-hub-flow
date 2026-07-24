import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { fetchServicePoints, fetchTodayTickets } from "@/lib/sigat-queries";
import {
  callNextTicket,
  returnTicketToOrigin,
  transferTicketToCounter,
  updateTicketStatus,
} from "@/lib/sigat.functions";
import { formatTicketCode } from "@/lib/ticket-code";
import { toast } from "sonner";
import {
  PhoneCall, RefreshCcw, UserX, CheckCircle2, XCircle, PlayCircle, Building2, ArrowRightLeft, Undo2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/operator")({
  head: () => ({ meta: [{ title: "Puesto de atención — SIGAT" }] }),
  component: OperatorPage,
});

type TicketRow = {
  id: string; code: string; ci: string; status: string;
  created_at: string; called_at: string | null;
  area?: { name: string } | null; procedure?: { name: string } | null;
  service_point_id: string | null; operator_id: string | null;
  origin_service_point_id?: string | null;
  origin_operator_id?: string | null;
  transfer_to?: "counter" | "origin" | null;
  service_point?: { name: string; kind?: string } | null;
};

function resolveSpKind(sp: { kind?: string | null; name: string } | null | undefined) {
  if (!sp) return "standard" as const;
  if (sp.kind === "ruat" || sp.kind === "counter" || sp.kind === "standard") return sp.kind;
  const n = sp.name.toLowerCase();
  if (n.includes("ventanilla")) return "counter" as const;
  if (n.includes("ruat")) return "ruat" as const;
  return "standard" as const;
}

function OperatorPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();

  const sps = useQuery({ queryKey: ["service_points"], queryFn: fetchServicePoints });
  const tickets = useQuery({ queryKey: ["today_tickets"], queryFn: fetchTodayTickets });

  const callFn = useServerFn(callNextTicket);
  const upFn = useServerFn(updateTicketStatus);
  const transferFn = useServerFn(transferTicketToCounter);
  const returnFn = useServerFn(returnTicketToOrigin);

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
  const spKind = resolveSpKind(assignedSp);

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

  const doTransfer = useMutation({
    mutationFn: async (ticketId: string) => transferFn({ data: { ticketId } }),
    onSuccess: () => {
      toast.success("Derivado a ventanilla");
      qc.invalidateQueries({ queryKey: ["today_tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doReturn = useMutation({
    mutationFn: async (ticketId: string) => returnFn({ data: { ticketId } }),
    onSuccess: () => {
      toast.success("Devuelto al operador RUAT de origen");
      qc.invalidateQueries({ queryKey: ["today_tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const myCalling = useMemo(
    () => (tickets.data as TicketRow[] | undefined)?.find(
      (t) => t.service_point_id === spId && t.operator_id === user.id && (t.status === "calling" || t.status === "in_service"),
    ) ?? null,
    [tickets.data, spId, user.id],
  );

  const queueCount = useMemo(() => {
    const list = (tickets.data as TicketRow[] | undefined) ?? [];
    if (spKind === "counter") {
      return list.filter((t) => t.status === "waiting" && t.transfer_to === "counter").length;
    }
    if (spKind === "ruat" && spId) {
      return list.filter((t) =>
        t.status === "waiting" && (
          (t.transfer_to === "origin" && t.origin_service_point_id === spId)
          || t.transfer_to == null
        ),
      ).length;
    }
    return list.filter((t) => t.status === "waiting" && t.transfer_to == null).length;
  }, [tickets.data, spKind, spId]);

  const dayTickets = ((tickets.data as TicketRow[] | undefined) ?? []).slice(0, 20);
  const canReturnToRuat = spKind === "counter" && !!myCalling?.origin_service_point_id;

  if (sps.isLoading) {
    return (
      <div className="mx-auto max-w-lg p-4 md:p-10">
        <p className="text-sm text-muted-foreground">Cargando puesto de atención…</p>
      </div>
    );
  }

  if (!assignedSp) {
    return (
      <div className="mx-auto max-w-lg p-4 md:p-10">
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center md:p-8">
          <Building2 className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-bold md:text-2xl">Sin puesto asignado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tu usuario no tiene un puesto de atención vinculado. Un administrador debe asignarte uno en la sección Puestos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:space-y-6 md:p-10">
      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground md:text-xs">Puesto de atención</p>
        <h1 className="text-2xl font-extrabold leading-tight md:text-3xl">{assignedSp.name}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {spKind === "ruat" ? "Operador RUAT — puede derivar a ventanilla"
            : spKind === "counter" ? "Ventanilla — puede devolver al RUAT de origen"
              : "Puesto general"}
        </p>
        {!assignedSp.active && (
          <p className="mt-1 text-sm text-destructive">Este puesto está inactivo.</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <Stat label="En espera" value={queueCount} />
        <Stat label="Mi turno" value={myCalling ? formatTicketCode(myCalling.code) : "—"} highlight />
        <Stat label="Estado" value={myCalling ? (myCalling.status === "calling" ? "Llamando" : "Atención") : "Libre"} />
      </div>

      {myCalling ? (
        <div className="rounded-2xl border-2 border-primary/40 bg-gradient-to-b from-primary/5 to-transparent p-4 md:rounded-3xl md:p-8">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground md:text-xs">Ticket actual</p>
            <p className="mt-1 font-ticket text-6xl font-black leading-none text-primary md:mt-2 md:text-7xl">
              {formatTicketCode(myCalling.code)}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5 text-xs md:mt-3 md:gap-2 md:text-sm">
              <span className="rounded-full bg-accent px-2.5 py-1 font-medium md:px-3">{myCalling.area?.name}</span>
              <span className="rounded-full bg-accent px-2.5 py-1 font-medium md:px-3">{myCalling.procedure?.name}</span>
              {myCalling.ci ? (
                <span className="rounded-full border border-border px-2.5 py-1 md:px-3">CI: {myCalling.ci}</span>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 md:mt-6 md:grid-cols-3">
            <ActionBtn onClick={() => doUpdate.mutate({ id: myCalling.id, status: "calling" })} icon={RefreshCcw} label="Repetir llamado" />
            {myCalling.status === "calling" && (
              <ActionBtn primary onClick={() => doUpdate.mutate({ id: myCalling.id, status: "in_service" })} icon={PlayCircle} label="Iniciar atención" />
            )}
            {spKind === "ruat" && (
              <ActionBtn
                onClick={() => doTransfer.mutate(myCalling.id)}
                icon={ArrowRightLeft}
                label={doTransfer.isPending ? "Derivando..." : "Derivar a ventanilla"}
              />
            )}
            {canReturnToRuat && (
              <ActionBtn
                onClick={() => doReturn.mutate(myCalling.id)}
                icon={Undo2}
                label={doReturn.isPending ? "Devolviendo..." : "Devolver a RUAT"}
              />
            )}
            <ActionBtn variant="success" onClick={() => doUpdate.mutate({ id: myCalling.id, status: "finished" })} icon={CheckCircle2} label="Finalizar" />
            <ActionBtn variant="warning" onClick={() => doUpdate.mutate({ id: myCalling.id, status: "absent" })} icon={UserX} label="Ausente" />
            <ActionBtn variant="destructive" onClick={() => doUpdate.mutate({ id: myCalling.id, status: "cancelled" })} icon={XCircle} label="Cancelar" />
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center md:rounded-3xl md:p-10">
          <p className="text-base text-muted-foreground md:text-lg">No estás atendiendo a nadie</p>
          <button
            type="button"
            onClick={() => callNext.mutate()}
            disabled={callNext.isPending || !assignedSp.active}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-primary px-6 py-4 text-base font-semibold text-primary-foreground shadow-elegant hover:brightness-105 disabled:opacity-50 md:w-auto md:rounded-full md:px-8 md:py-3.5 md:text-lg"
          >
            <PhoneCall className="h-5 w-5" /> {callNext.isPending ? "Llamando..." : "Llamar siguiente"}
          </button>
        </div>
      )}

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground md:text-sm">Cola del día</h2>

        <div className="mt-3 space-y-2 md:hidden">
          {dayTickets.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Sin turnos hoy
            </p>
          ) : (
            dayTickets.map((t) => (
              <div key={t.id} className="rounded-2xl border border-border bg-card px-3.5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-ticket text-xl font-bold text-primary">{formatTicketCode(t.code)}</span>
                  <StatusPill s={t.status} transferTo={t.transfer_to} />
                </div>
                <p className="mt-1 text-sm font-medium leading-snug">{t.procedure?.name ?? "—"}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t.service_point?.name ?? "Sin puesto"}</p>
              </div>
            ))
          )}
        </div>

        <div className="mt-3 hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
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
              {dayTickets.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-4 py-2 font-ticket font-bold">{formatTicketCode(t.code)}</td>
                  <td className="px-4 py-2">{t.procedure?.name}</td>
                  <td className="px-4 py-2"><StatusPill s={t.status} transferTo={t.transfer_to} /></td>
                  <td className="px-4 py-2 text-muted-foreground">{t.service_point?.name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border border-border bg-card p-3 md:rounded-2xl md:p-5 ${highlight ? "border-primary/30 bg-primary/5" : ""}`}>
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground md:text-xs">{label}</p>
      <p className={`mt-0.5 font-extrabold leading-none md:mt-1 ${highlight ? "font-ticket text-2xl text-primary md:text-3xl" : "text-xl md:text-3xl"}`}>
        {value}
      </p>
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
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition md:min-h-0 ${cls}`}
    >
      <Icon className="h-4 w-4 shrink-0" /> {label}
    </button>
  );
}

function StatusPill({ s, transferTo }: { s: string; transferTo?: string | null }) {
  if (s === "waiting" && transferTo === "counter") {
    return <span className="inline-flex shrink-0 rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-medium text-warning-foreground md:text-xs">A ventanilla</span>;
  }
  if (s === "waiting" && transferTo === "origin") {
    return <span className="inline-flex shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary md:text-xs">Vuelve a RUAT</span>;
  }
  const map: Record<string, { label: string; cls: string }> = {
    waiting: { label: "En espera", cls: "bg-muted text-foreground" },
    calling: { label: "Llamando", cls: "bg-warning/20 text-warning-foreground" },
    in_service: { label: "En atención", cls: "bg-primary/15 text-primary" },
    finished: { label: "Finalizado", cls: "bg-success/15 text-success" },
    absent: { label: "Ausente", cls: "bg-destructive/10 text-destructive" },
    cancelled: { label: "Cancelado", cls: "bg-destructive/10 text-destructive" },
  };
  const m = map[s] ?? { label: s, cls: "bg-muted" };
  return <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium md:text-xs ${m.cls}`}>{m.label}</span>;
}
