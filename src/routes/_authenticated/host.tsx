import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, RotateCcw, TicketPlus } from "lucide-react";
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

  if (allowed === null) return <div className="p-10 text-sm text-muted-foreground">Cargando…</div>;
  if (!allowed) {
    return (
      <div className="p-10">
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
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
    <div className="p-6 md:p-10">
      <h1 className="text-3xl font-extrabold">Sacar turnos</h1>
      <p className="text-sm text-muted-foreground">
        Genera turnos para contribuyentes sin celular o que llegan en grupo. Un turno por CI.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="rounded-2xl border border-border bg-card p-5 md:p-6">
          <label className="text-sm font-semibold">CI del contribuyente</label>
          <input
            inputMode="numeric"
            value={ci}
            onChange={(e) => setCi(e.target.value.replace(/[^0-9A-Za-z-]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && canGenerate && generate.mutate()}
            placeholder="12345678"
            className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-center text-xl font-mono tracking-widest outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />

          <p className="mt-5 text-sm font-semibold">Área</p>
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
            {(areas.data ?? []).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => { setAreaId(a.id); setProcedureId(null); }}
                className={`rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition ${
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
                    className={`rounded-xl border-2 px-4 py-2.5 text-left text-sm font-medium transition ${
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
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary py-3.5 text-lg font-semibold text-primary-foreground shadow-elegant transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <TicketPlus className="h-5 w-5" />
            {generate.isPending ? "Generando..." : "Generar turno"}
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {lastTicket && (
            <div className="rounded-2xl border-2 border-dashed border-primary/40 bg-gradient-to-b from-primary/5 to-transparent p-5 text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
                <CheckCircle2 className="h-3.5 w-3.5" /> Turno generado
              </div>
              <p className="mt-3 font-ticket text-6xl font-extrabold text-primary">{formatTicketCode(lastTicket.code)}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                CI <span className="font-mono font-semibold text-foreground">{lastTicket.ci}</span>
              </p>
              <p className="text-sm text-muted-foreground">{lastTicket.procedure?.name ?? lastTicket.area?.name ?? ""}</p>
              <button
                type="button"
                onClick={() => setLastTicket(null)}
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-xs font-medium hover:bg-accent"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Limpiar
              </button>
            </div>
          )}

          {recent.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Últimos generados</p>
              <ul className="mt-2 divide-y divide-border text-sm">
                {recent.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-2">
                    <span className="font-ticket font-bold text-primary">{formatTicketCode(t.code)}</span>
                    <span className="font-mono text-xs text-muted-foreground">{t.ci}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
