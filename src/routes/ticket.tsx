import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, RefreshCcw, Star, XCircle } from "lucide-react";
import { fetchAreas, fetchProcedures, type Area, type Procedure } from "@/lib/sigat-queries";
import {
  cancelTicketByCi,
  findActiveTicketByCi,
  findRateableTicketByCi,
  generateTicket,
  submitTicketRating,
} from "@/lib/sigat.functions";
import { formatTicketCode } from "@/lib/ticket-code";

export const Route = createFileRoute("/ticket")({
  head: () => ({ meta: [{ title: "Sacar turno — SIGAT" }] }),
  component: TicketPage,
});

type Step = "ci" | "select" | "confirm" | "ticket" | "existing" | "rate";
type ActiveTicket = {
  id: string; code: string; ci: string; status: string;
  area?: Area | null; procedure?: Procedure | null;
  created_at: string;
};

function TicketPage() {
  const [step, setStep] = useState<Step>("ci");
  const [ci, setCi] = useState("");
  const [areaId, setAreaId] = useState<string | null>(null);
  const [procedureId, setProcedureId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<ActiveTicket | null>(null);

  const areas = useQuery({ queryKey: ["areas"], queryFn: fetchAreas });
  const procs = useQuery({
    queryKey: ["procs", areaId],
    queryFn: () => fetchProcedures(areaId!),
    enabled: !!areaId,
  });

  const findFn = useServerFn(findActiveTicketByCi);
  const findRateFn = useServerFn(findRateableTicketByCi);
  const genFn = useServerFn(generateTicket);
  const cancelFn = useServerFn(cancelTicketByCi);
  const rateFn = useServerFn(submitTicketRating);

  const checkCi = useMutation({
    mutationFn: async (c: string) => {
      const active = await findFn({ data: { ci: c } });
      if (active) return { kind: "active" as const, ticket: active };
      const rateable = await findRateFn({ data: { ci: c } });
      if (rateable) return { kind: "rate" as const, ticket: rateable };
      return { kind: "none" as const, ticket: null };
    },
    onSuccess: (data) => {
      if (data.kind === "active") {
        setTicket(data.ticket as ActiveTicket);
        setStep("existing");
      } else if (data.kind === "rate") {
        setTicket(data.ticket as ActiveTicket);
        setStep("rate");
      } else {
        setStep("select");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generate = useMutation({
    mutationFn: async () => genFn({ data: { ci, areaId: areaId!, procedureId: procedureId! } }),
    onSuccess: (data) => {
      const row = data as ActiveTicket;
      setTicket({
        ...row,
        area: row.area ?? areas.data?.find((a) => a.id === areaId) ?? null,
        procedure: row.procedure ?? procs.data?.find((p) => p.id === procedureId) ?? null,
      });
      setStep("ticket");
      toast.success("Ticket generado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async () => cancelFn({ data: { ci, ticketId: ticket!.id } }),
    onSuccess: () => { setTicket(null); setStep("ci"); toast.success("Ticket cancelado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rate = useMutation({
    mutationFn: async (p: { score: number; comment: string }) =>
      rateFn({ data: { ci, ticketId: ticket!.id, score: p.score, comment: p.comment || undefined } }),
    onSuccess: () => {
      toast.success("¡Gracias por tu calificación!");
      setTicket(null);
      setAreaId(null);
      setProcedureId(null);
      setStep("select");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedArea = areas.data?.find((a) => a.id === areaId);
  const selectedProc = procs.data?.find((p) => p.id === procedureId);

  return (
    <div className="relative min-h-dvh bg-gradient-hero px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="pointer-events-none absolute inset-0 opacity-15 [background-image:radial-gradient(circle_at_20%_20%,white_1px,transparent_1px),radial-gradient(circle_at_80%_60%,white_1px,transparent_1px)] [background-size:32px_32px,48px_48px]" />
      <div className="relative mx-auto max-w-lg">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white/90 backdrop-blur-sm transition hover:bg-white/15 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Inicio
          </Link>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-white/70">
            <img src="/sigat-icon.png" alt="" className="h-7 w-7 rounded-lg" />
            SIGAT
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-card p-5 shadow-elegant md:p-8">
          {step === "ci" && (
            <StepCi
              ci={ci} setCi={setCi}
              onNext={() => {
                if (ci.trim().length < 4) return toast.error("Ingresa un CI válido");
                checkCi.mutate(ci.trim());
              }}
              loading={checkCi.isPending}
            />
          )}
          {step === "rate" && ticket && (
            <StepRate
              t={ticket}
              loading={rate.isPending}
              onSkip={() => {
                setTicket(null);
                setStep("select");
              }}
              onSubmit={(score, comment) => rate.mutate({ score, comment })}
            />
          )}
          {step === "select" && (
            <StepSelect
              ci={ci}
              areas={areas.data ?? []}
              procs={procs.data ?? []}
              procsLoading={procs.isFetching}
              areaId={areaId} setAreaId={(v) => { setAreaId(v); setProcedureId(null); }}
              procedureId={procedureId} setProcedureId={setProcedureId}
              onBack={() => setStep("ci")}
              onNext={() => {
                if (!areaId || !procedureId) return toast.error("Selecciona área y trámite");
                setStep("confirm");
              }}
            />
          )}
          {step === "confirm" && selectedArea && selectedProc && (
            <StepConfirm
              ci={ci} area={selectedArea} proc={selectedProc}
              onBack={() => setStep("select")}
              onConfirm={() => generate.mutate()}
              loading={generate.isPending}
            />
          )}
          {step === "ticket" && ticket && <TicketView t={ticket} onDone={() => { setCi(""); setAreaId(null); setProcedureId(null); setTicket(null); setStep("ci"); }} />}
          {step === "existing" && ticket && (
            <ExistingTicket t={ticket} onCancel={() => cancel.mutate()} loading={cancel.isPending} onView={() => setStep("ticket")} />
          )}
        </div>
      </div>
    </div>
  );
}

function StepCi({ ci, setCi, onNext, loading }: { ci: string; setCi: (v: string) => void; onNext: () => void; loading: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Paso 1 de 3</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">Ingresá tu CI</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Con tu carnet generamos y vinculamos tu turno.</p>
      <input
        autoFocus inputMode="numeric" value={ci}
        onChange={(e) => setCi(e.target.value.replace(/[^0-9A-Za-z-]/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && onNext()}
        placeholder="12345678"
        className="mt-6 w-full rounded-2xl border border-input bg-background px-4 py-4 text-center text-2xl font-mono tracking-widest outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
      />
      <button
        onClick={onNext} disabled={loading}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-3.5 text-lg font-semibold text-primary-foreground shadow-elegant transition hover:brightness-105 disabled:opacity-50"
      >
        {loading ? "Verificando..." : "Continuar"} <ArrowRight className="h-5 w-5" />
      </button>
    </div>
  );
}

function StepRate({
  t, onSubmit, onSkip, loading,
}: {
  t: ActiveTicket;
  onSubmit: (score: number, comment: string) => void;
  onSkip: () => void;
  loading: boolean;
}) {
  const [score, setScore] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const active = hover || score;

  return (
    <div className="text-center">
      <div className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-sm font-medium text-success">
        <CheckCircle2 className="h-4 w-4" /> Atención finalizada
      </div>
      <h1 className="mt-4 text-2xl font-bold">¿Cómo fue la atención?</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Turno <span className="font-ticket font-bold text-primary">{formatTicketCode(t.code)}</span>
        {t.procedure?.name ? ` · ${t.procedure.name}` : ""}
      </p>

      <div className="mt-6 flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} estrella${n > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setScore(n)}
            className="rounded-lg p-1 transition hover:scale-110"
          >
            <Star
              className={`h-10 w-10 ${active >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
            />
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {score === 0 ? "Selecciona de 1 a 5 estrellas" : score <= 2 ? "Mejorable" : score === 3 ? "Aceptable" : score === 4 ? "Buena" : "Excelente"}
      </p>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, 400))}
        placeholder="Comentario opcional"
        rows={3}
        className="mt-5 w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
      />

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          disabled={score < 1 || loading}
          onClick={() => onSubmit(score, comment.trim())}
          className="rounded-xl bg-gradient-primary py-3.5 font-semibold text-primary-foreground shadow-elegant hover:brightness-105 disabled:opacity-50"
        >
          {loading ? "Enviando..." : "Enviar calificación"}
        </button>
        <button type="button" onClick={onSkip} className="rounded-xl border border-border py-3 text-sm font-medium hover:bg-accent">
          Ahora no, sacar otro turno
        </button>
      </div>
    </div>
  );
}

function StepSelect({
  ci, areas, procs, procsLoading, areaId, setAreaId, procedureId, setProcedureId, onBack, onNext,
}: {
  ci: string;
  areas: Area[]; procs: Procedure[]; procsLoading: boolean;
  areaId: string | null; setAreaId: (v: string) => void;
  procedureId: string | null; setProcedureId: (v: string) => void;
  onBack: () => void; onNext: () => void;
}) {
  const canContinue = !!areaId && !!procedureId;

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Cambiar CI
      </button>

      <p className="mt-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">Paso 2 de 3</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">¿Qué trámite necesitás?</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        CI <span className="font-mono font-semibold text-foreground">{ci}</span>
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">1. Elegí el área</h2>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {areas.map((a) => {
            const selected = areaId === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setAreaId(a.id)}
                className={`flex items-center gap-3 rounded-2xl border-2 px-3.5 py-3.5 text-left transition ${
                  selected
                    ? "border-primary bg-primary text-primary-foreground shadow-elegant"
                    : "border-border bg-background hover:border-primary/40 hover:bg-accent/40"
                }`}
              >
                <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">{a.name}</span>
                {selected && <CheckCircle2 className="h-5 w-5 shrink-0 opacity-90" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">2. Elegí el trámite</h2>
        {!areaId ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            Primero seleccioná un área para ver los trámites.
          </p>
        ) : procsLoading ? (
          <p className="mt-3 rounded-2xl border border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            Cargando trámites…
          </p>
        ) : procs.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            No hay trámites activos en esta área.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {procs.map((p) => {
              const selected = procedureId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProcedureId(p.id)}
                  className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition ${
                    selected
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border bg-background hover:border-primary/35 hover:bg-accent/30"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      selected ? "border-primary bg-primary" : "border-muted-foreground/35"
                    }`}
                  >
                    {selected && <span className="h-2 w-2 rounded-full bg-primary-foreground" />}
                  </span>
                  <span className={`flex-1 text-sm font-medium leading-snug ${selected ? "text-foreground" : "text-foreground/90"}`}>
                    {p.name}
                  </span>
                  {selected && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={onNext}
        disabled={!canContinue}
        className="mt-7 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-3.5 text-lg font-semibold text-primary-foreground shadow-elegant transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Continuar <ArrowRight className="h-5 w-5" />
      </button>
    </div>
  );
}

function StepConfirm({ ci, area, proc, onBack, onConfirm, loading }: { ci: string; area: Area; proc: Procedure; onBack: () => void; onConfirm: () => void; loading: boolean }) {
  const now = new Date();
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Paso 3 de 3</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">Confirmá tu turno</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Revisá los datos antes de generar el número.</p>
      <dl className="mt-6 overflow-hidden divide-y divide-border rounded-2xl border border-border bg-muted/20">
        <Row label="CI" value={ci} />
        <Row label="Área" value={`${area.code} · ${area.name}`} />
        <Row label="Trámite" value={proc.name} />
        <Row label="Fecha" value={now.toLocaleDateString("es-BO")} />
        <Row label="Hora" value={now.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })} />
      </dl>
      <div className="mt-6 flex flex-col gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="rounded-2xl bg-gradient-primary py-3.5 font-semibold text-primary-foreground shadow-elegant hover:brightness-105 disabled:opacity-50"
        >
          {loading ? "Generando..." : "Confirmar y generar ticket"}
        </button>
        <button type="button" onClick={onBack} className="rounded-2xl border border-border py-3 font-medium hover:bg-accent">
          Cambiar trámite
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function TicketView({ t, onDone }: { t: ActiveTicket; onDone: () => void }) {
  const [qr, setQr] = useState<string>("");
  useEffect(() => {
    QRCode.toDataURL(JSON.stringify({ id: t.id, code: t.code, ci: t.ci }), { width: 200, margin: 1 })
      .then(setQr);
  }, [t.id, t.code, t.ci]);
  const created = new Date(t.created_at);
  return (
    <div className="text-center">
      <div className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-sm font-medium text-success">
        <CheckCircle2 className="h-4 w-4" /> Ticket generado
      </div>
      <div className="mt-6 rounded-3xl border-2 border-dashed border-primary/40 bg-gradient-to-b from-primary/5 to-transparent p-6">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Tu número</p>
        <div className="mt-2 font-ticket text-6xl font-extrabold text-primary md:text-7xl">{formatTicketCode(t.code)}</div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-left text-sm">
          <div><p className="text-muted-foreground">Área</p><p className="font-semibold">{t.area?.name ?? "—"}</p></div>
          <div><p className="text-muted-foreground">Trámite</p><p className="font-semibold">{t.procedure?.name ?? "—"}</p></div>
          <div><p className="text-muted-foreground">Fecha</p><p className="font-semibold">{created.toLocaleDateString("es-BO")}</p></div>
          <div><p className="text-muted-foreground">Hora</p><p className="font-semibold">{created.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}</p></div>
        </div>
        {qr && <img src={qr} alt="QR" className="mx-auto mt-5 h-40 w-40 rounded-lg border border-border bg-white p-2" />}
      </div>
      <p className="mt-5 text-sm text-muted-foreground">
        Espera tu llamado en la pantalla. Se te asignará automáticamente un puesto de atención.
      </p>
      <button onClick={onDone} className="mt-4 inline-flex items-center gap-2 rounded-full border border-border px-5 py-2 text-sm font-medium hover:bg-accent">
        <RefreshCcw className="h-4 w-4" /> Sacar otro turno
      </button>
    </div>
  );
}

function ExistingTicket({ t, onView, onCancel, loading }: { t: ActiveTicket; onView: () => void; onCancel: () => void; loading: boolean }) {
  const statusLabel = useMemo(() => ({
    waiting: "En espera", calling: "Llamando", in_service: "En atención",
  } as Record<string, string>)[t.status] ?? t.status, [t.status]);
  return (
    <div>
      <div className="inline-flex items-center gap-2 rounded-full bg-warning/15 px-3 py-1 text-sm font-medium text-warning-foreground">
        <Clock className="h-4 w-4" /> Ya tienes un turno activo
      </div>
      <div className="mt-5 rounded-2xl border border-border bg-accent/40 p-5">
        <p className="text-xs text-muted-foreground">Turno</p>
        <p className="font-ticket text-4xl font-extrabold text-primary">{formatTicketCode(t.code)}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-muted-foreground">Estado</p><p className="font-semibold">{statusLabel}</p></div>
          <div><p className="text-muted-foreground">Trámite</p><p className="font-semibold">{t.procedure?.name ?? "—"}</p></div>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-2">
        <button onClick={onView} className="rounded-xl bg-gradient-primary py-3 font-semibold text-primary-foreground shadow-elegant hover:brightness-105">
          Ver ticket
        </button>
        {t.status === "waiting" && (
          <button onClick={onCancel} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/40 py-3 font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50">
            <XCircle className="h-4 w-4" /> {loading ? "Cancelando..." : "Cancelar ticket"}
          </button>
        )}
      </div>
    </div>
  );
}
