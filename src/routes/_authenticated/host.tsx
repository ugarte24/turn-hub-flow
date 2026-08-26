import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Printer, TicketPlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAreas, fetchProcedures, type Area, type Procedure } from "@/lib/sigat-queries";
import { generateTicketAsStaff } from "@/lib/sigat.functions";
import { formatTicketCode, formatTicketCodeHtml, TicketCodeView } from "@/lib/ticket-code";
import { todayLaPaz } from "@/lib/date";
import {
  parseThermalPrinterSettings,
  printTicketThermal,
  type ThermalPrinterSettings,
  DEFAULT_THERMAL_PRINTER,
} from "@/lib/thermal-printer";

export const Route = createFileRoute("/_authenticated/host")({
  head: () => ({ meta: [{ title: "Sacar turnos — SIGAT" }] }),
  component: HostPage,
});

type GeneratedTicket = {
  id: string; code: string; ci?: string; created_at?: string;
  preferential?: boolean;
  area?: Area | null; procedure?: Procedure | null;
};

function printHostTicket(t: GeneratedTicket) {
  const code = formatTicketCode(t.code);
  const codeHtml = formatTicketCodeHtml(t.code);
  const created = t.created_at ? new Date(t.created_at) : new Date();
  const dd = String(created.getDate()).padStart(2, "0");
  const mm = String(created.getMonth() + 1).padStart(2, "0");
  const yyyy = String(created.getFullYear());
  const fecha = `${dd}/${mm}/${yyyy}`;
  const hora = created.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", hour12: false });
  const area = t.area?.name ?? "—";
  const proc = t.procedure?.name ?? "—";

  // Plantilla conservadora para Epson TM-T20III / drivers Windows:
  // - sin flex (suele desbordar)
  // - una sola columna (nada se corta a la derecha)
  // - código en Arial bold (la serif deformaba la "I")
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Ticket ${code}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    * { box-sizing: border-box; }
    .ticket {
      width: 56mm;
      max-width: 56mm;
      margin: 0 auto;
      padding: 1mm 0 2mm;
      text-align: center;
    }
    .brand {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      line-height: 1.2;
    }
    .sub {
      font-size: 9px;
      margin-top: 1mm;
      line-height: 1.25;
    }
    .rule {
      border: none;
      border-top: 1px dashed #000;
      margin: 2mm 0;
    }
    .label {
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .code {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 40px;
      font-weight: 700;
      line-height: 1.05;
      margin: 1mm 0;
      letter-spacing: 0;
      white-space: nowrap;
    }
    .meta {
      text-align: left;
      font-size: 11px;
      line-height: 1.35;
    }
    .meta div {
      margin: 1.2mm 0;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .meta b {
      font-weight: 700;
    }
    .foot {
      font-size: 9px;
      margin-top: 1mm;
      line-height: 1.25;
    }
  </style>
</head>
<body>
  <div class="ticket">
    <div class="brand">Jefatura de Recaudaciones</div>
    <div class="sub">SIGAT — Comprobante de turno</div>
    <hr class="rule" />
    <div class="label">Número de turno</div>
    <div class="code">${codeHtml}</div>
    <hr class="rule" />
    <div class="meta">
      <div>Área: <b>${escapeHtml(area)}</b></div>
      <div>Trámite: <b>${escapeHtml(proc)}</b></div>
      <div>Fecha: <b>${escapeHtml(fecha)}</b></div>
      <div>Hora: <b>${escapeHtml(hora)}</b></div>
    </div>
    <hr class="rule" />
    <div class="foot">Espere su llamado en la pantalla</div>
  </div>
</body>
</html>`;

  // Iframe oculto: no depende de ventanas emergentes (más fiable en Chrome/Edge).
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("title", "Imprimir ticket");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  });

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    URL.revokeObjectURL(url);
    iframe.remove();
  };

  iframe.addEventListener("load", () => {
    const win = iframe.contentWindow;
    if (!win) {
      toast.error("No se pudo preparar la impresión");
      cleanup();
      return;
    }
    const onAfterPrint = () => {
      win.removeEventListener("afterprint", onAfterPrint);
      cleanup();
    };
    win.addEventListener("afterprint", onAfterPrint);
    // Fallback por si afterprint no dispara en algún navegador
    window.setTimeout(cleanup, 120_000);

    window.setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        toast.error("No se pudo abrir el diálogo de impresión");
        cleanup();
      }
    }, 50);
  });

  document.body.appendChild(iframe);
  iframe.src = url;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

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
  return <HostForm userId={user.id} />;
}

function HostForm({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const genFn = useServerFn(generateTicketAsStaff);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [procedureId, setProcedureId] = useState<string | null>(null);
  const [preferential, setPreferential] = useState(false);
  const [lastTicket, setLastTicket] = useState<GeneratedTicket | null>(null);
  const [thermal, setThermal] = useState<ThermalPrinterSettings>(DEFAULT_THERMAL_PRINTER);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    void supabase.from("settings").select("*").then(({ data }) => {
      const row = (data ?? []).find((r) => r.key === "thermal_printer");
      setThermal(parseThermalPrinterSettings(row?.value));
    });
  }, []);

  async function handlePrint(t: GeneratedTicket) {
    setPrinting(true);
    try {
      if (thermal.enabled) {
        const code = formatTicketCode(t.code);
        const result = await printTicketThermal(
          {
            code,
            area: t.area?.name,
            procedure: t.procedure?.name,
            created_at: t.created_at,
          },
          thermal,
        );
        const via =
          result.method === "agent"
            ? "agente local"
            : result.method === "rawbt"
              ? "RawBT"
              : "servidor";
        toast.success(`Ticket ${code} enviado (${via})`);
      } else {
        printHostTicket(t);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo imprimir por red";
      toast.error(msg);
      // Fallback al diálogo del navegador
      try {
        printHostTicket(t);
      } catch {
        /* ignore */
      }
    } finally {
      setPrinting(false);
    }
  }

  const areas = useQuery({ queryKey: ["areas"], queryFn: fetchAreas });
  const procs = useQuery({
    queryKey: ["procs", areaId],
    queryFn: () => fetchProcedures(areaId!),
    enabled: !!areaId,
  });

  // Solo turnos del día generados por este usuario de mostrador
  const recentQ = useQuery({
    queryKey: ["host_recent_tickets", todayLaPaz(), userId],
    queryFn: async (): Promise<GeneratedTicket[]> => {
      const today = todayLaPaz();
      const { data, error } = await supabase
        .from("tickets")
        .select("*, area:areas(*), procedure:procedures(*)")
        .eq("day", today)
        .eq("created_by", userId)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw new Error(error.message);
      return (data ?? []) as GeneratedTicket[];
    },
  });
  const recent = recentQ.data ?? [];

  const generate = useMutation({
    mutationFn: async () => genFn({
      data: { areaId: areaId!, procedureId: procedureId!, preferential },
    }),
    onSuccess: (data) => {
      const row = data as GeneratedTicket;
      const full: GeneratedTicket = {
        ...row,
        area: row.area ?? areas.data?.find((a) => a.id === areaId) ?? null,
        procedure: row.procedure ?? procs.data?.find((p) => p.id === procedureId) ?? null,
      };
      setLastTicket(full);
      setProcedureId(null);
      setPreferential(false);
      void qc.invalidateQueries({ queryKey: ["host_recent_tickets"] });
      if (thermal.enabled && thermal.autoPrint) {
        void handlePrint(full);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canGenerate = !!areaId && !!procedureId && !generate.isPending;

  return (
    <div className="p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:p-10">
      <h1 className="text-2xl font-extrabold md:text-3xl">Sacar turnos</h1>
      <p className="text-sm text-muted-foreground">
        Genera turnos para contribuyentes sin celular o que llegan en grupo.
      </p>

      <div className="mt-5 grid gap-4 md:mt-6 md:gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="rounded-2xl border border-border bg-card p-4 md:p-6">
          <p className="text-sm font-semibold">Área</p>
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

          <label className="mt-5 flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
            <input
              type="checkbox"
              checked={preferential}
              onChange={(e) => setPreferential(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span className="text-sm font-medium">
              Prioridad
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                Tercera edad, discapacidad u otra prioridad
              </span>
            </span>
          </label>

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
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Últimos generados</p>
            {recentQ.isLoading ? (
              <p className="mt-3 text-sm text-muted-foreground">Cargando…</p>
            ) : recent.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Aún no hay turnos generados por ti hoy.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border text-sm">
                {recent.map((t) => (
                  <li key={t.id} className="flex min-h-10 items-center justify-between gap-2 py-2.5">
                    <span className="font-ticket font-bold text-primary"><TicketCodeView code={t.code} /></span>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-xs text-muted-foreground">
                        {t.procedure?.name ?? "—"}
                      </span>
                      <button
                        type="button"
                        aria-label={`Imprimir ${formatTicketCode(t.code)}`}
                        disabled={printing}
                        onClick={() => void handlePrint(t)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
                <TicketCodeView code={lastTicket.code} />
              </p>

              <dl className="mt-6 w-full space-y-2.5 rounded-2xl border border-border bg-accent/40 p-4 text-left text-sm">
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
                {lastTicket.created_at && (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Fecha</dt>
                      <dd className="text-right font-semibold">
                        {new Date(lastTicket.created_at).toLocaleDateString("es-BO")}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Hora</dt>
                      <dd className="text-right font-semibold">
                        {new Date(lastTicket.created_at).toLocaleTimeString("es-BO", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </dd>
                    </div>
                  </>
                )}
              </dl>

              <div className="mt-6 flex w-full flex-col gap-2">
                <button
                  type="button"
                  disabled={printing}
                  onClick={() => void handlePrint(lastTicket)}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-3 font-semibold text-primary-foreground shadow-elegant transition hover:brightness-105 disabled:opacity-50"
                >
                  <Printer className="h-4 w-4" />
                  {printing
                    ? "Imprimiendo..."
                    : thermal.enabled
                      ? "Imprimir (térmica / red)"
                      : "Imprimir ticket"}
                </button>
                <button
                  type="button"
                  onClick={() => setLastTicket(null)}
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-border px-4 py-3 font-semibold hover:bg-accent"
                >
                  Continuar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
