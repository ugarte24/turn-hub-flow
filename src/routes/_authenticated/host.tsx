import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, TicketPlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAreas, fetchProcedures, type Area, type Procedure } from "@/lib/sigat-queries";
import { generateTicketAsStaff } from "@/lib/sigat.functions";
import { formatTicketCode } from "@/lib/ticket-code";

export const Route = createFileRoute("/_authenticated/host")({
  head: () => ({ meta: [{ title: "Sacar turnos — SIGAT" }] }),
  component: HostPage,
});

type GeneratedTicket = {
  id: string; code: string; ci: string;
  area?: Area | null; procedure?: Procedure | null;
};

function HostPage() {
  const { user } = Route.useRouteContext();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => {
      setAllowed((data ?? []).some((r) => r.role === "host" || r.role === "admin"));
    });
  }, [user.id]);

  if (allowed === null) {
    return (
      <div className="p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-sm text-muted-foreground md:p-10">
        Cargando…
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:p-10">
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground md:p-8">
          Tu cuenta no tiene el rol de Personal de apoyo. Pide al administrador que te lo asigne.
        </div>
      </div>
    );
  }
  return <HostForm />;
}

function HostForm() {
  const genFn = useServerFn(generateTicketAsStaff);
  const [ci, setCi] = useState("");
  const [areaId, setAreaId] = useState<string | null>(null);
  const [procedureId, setProcedureId] = useState<string | null>(null);
  const [lastTicket, setLastTicket] = useState<GeneratedTicket | null>(null);
  const [recent, setRecent] = useState<GeneratedTicket[]>([]);

  const areas = useQuery({ queryKey: ["areas"], queryFn: fetchAreas });
  const procs = useQuery({
    queryKey: ["procs", areaId],
    queryFn: () => fetchProcedures(areaId!),
    enabled: !!areaId,
  });

  const generate = useMutation({
    mutationFn: async () => genFn({ data: { ci: ci.trim(), areaId: areaId!, procedureId: procedureId! } }),
    onSuccess: (data) => {
      const row = data as GeneratedTicket;
      const full: GeneratedTicket = {
        ...row,
        area: row.area ?? areas.data?.find((a) => a.id === areaId) ?? null,
        procedure: row.procedure ?? procs.data?.find((p) => p.id === procedureId) ?? null,
      };
      setLastTicket(full);
      setRecent((r) => [full, ...r].slice(0, 8));
      setCi("");
      setProcedureId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canGenerate = ci.trim().length >= 4 && !!areaId && !!procedureId && !generate.isPending;

  return (
    <div className="p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:p-10">
      <h1 className="text-2xl font-extrabold md:text-3xl">Sacar turnos</h1>
      <p className="text-sm text-muted-foreground">
        Genera turnos para contribuyentes sin celular o que llegan en grupo. Un turno por CI.
      </p>

      <div className="mt-5 grid gap-4 md:mt-6 md:gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="rounded-2xl border border-border bg-card p-4 md:p-6">
          <label className="text-sm font-semibold">CI del contribuyente</label>
          <input
            inputMode="numeric"
            value={ci}
            onChange={(e) => setCi(e.target.value.replace(/[^0-9A-Za-z-]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && canGenerate && generate.mutate()}
            placeholder="12345678"
            className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3.5 text-center text-xl font-mono tracking-widest outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />

          <p className="mt-5 text-sm font-semibold">Área</p>
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
            {(areas.data ?? []).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => { setAreaId(a.id); setProcedureId(null); }}
                className={`min-h-12 rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition ${
                  areaId === a.id
                    ? "border-primary bg-primary text-primary-foreground shadow-elegant"
                    : "border-border bg-background hover:border-primary/40"
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>

          {areaId && (
            <>
              <p className="mt-5 text-sm font-semibold">Trámite</p>
              <div className="mt-2 flex flex-col gap-2">
                {(procs.data ?? []).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProcedureId(p.id)}
                    className={`min-h-12 rounded-xl border-2 px-4 py-3 text-left text-sm font-medium transition ${
                      procedureId === p.id
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background hover:border-primary/35"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </>
          )}

          <button
            type="button"
            disabled={!canGenerate}
            onClick={() => generate.mutate()}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary py-3.5 text-lg font-semibold text-primary-foreground shadow-elegant transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <TicketPlus className="h-5 w-5" />
            {generate.isPending ? "Generando..." : "Generar turno"}
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {recent.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Últimos generados</p>
              <ul className="mt-2 divide-y divide-border text-sm">
                {recent.map((t) => (
                  <li key={t.id} className="flex min-h-10 items-center justify-between gap-2 py-2.5">
                    <span className="font-ticket font-bold text-primary">{formatTicketCode(t.code)}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      <span className="font-mono">{t.ci}</span>
                      {t.procedure?.name ? ` · ${t.procedure.name}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {lastTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px] animate-host-popup-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="host-ticket-title"
          onClick={() => setLastTicket(null)}
        >
          <div
            className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-primary/25 bg-card p-6 shadow-glow animate-host-popup-in sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/15 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-success/15 blur-2xl" />

            <button
              type="button"
              aria-label="Cerrar"
              onClick={() => setLastTicket(null)}
              className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/80 text-muted-foreground hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success animate-host-check-in">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <p className="mt-3 text-sm font-semibold text-success">¡Turno generado!</p>

              <p id="host-ticket-title" className="mt-5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Número de turno
              </p>
              <p className="mt-1 font-ticket text-6xl font-extrabold tracking-tight text-primary sm:text-7xl animate-host-ticket-pop">
                {formatTicketCode(lastTicket.code)}
              </p>

              <dl className="mt-6 w-full space-y-2.5 rounded-2xl border border-border bg-accent/40 p-4 text-left text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">CI</dt>
                  <dd className="font-mono font-semibold">{lastTicket.ci}</dd>
                </div>
                {lastTicket.area?.name && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Área</dt>
                    <dd className="text-right font-semibold">{lastTicket.area.name}</dd>
                  </div>
                )}
                {lastTicket.procedure?.name && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Trámite</dt>
                    <dd className="text-right font-semibold">{lastTicket.procedure.name}</dd>
                  </div>
                )}
              </dl>

              <button
                type="button"
                onClick={() => setLastTicket(null)}
                className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-gradient-primary px-4 py-3 font-semibold text-primary-foreground shadow-elegant transition hover:brightness-105"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
