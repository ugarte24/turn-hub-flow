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
    <div className="min-h-screen bg-gradient-hero px-4 py-6">
      <div className="mx-auto max-w-lg">
        <Link to="/" className="mb-4 inline-flex items-center gap-2 text-sm text-white/80 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Inicio
        </Link>

        <div className="rounded-3xl bg-card p-6 shadow-elegant md:p-8">
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
              areas={areas.data ?? []}
              procs={procs.data ?? []}
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
      <h1 className="text-2xl font-bold">Ingresa tu CI</h1>
      <p className="mt-1 text-sm text-muted-foreground">Necesitamos tu número de carnet para generar el turno.</p>
      <input
        autoFocus inputMode="numeric" value={ci}
        onChange={(e) => setCi(e.target.value.replace(/[^0-9A-Za-z-]/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && onNext()}
        placeholder="12345678"
        className="mt-6 w-full rounded-xl border border-input bg-background px-4 py-4 text-center text-2xl font-mono tracking-widest outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
      />
      <button
        onClick={onNext} disabled={loading}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary py-3.5 text-lg font-semibold text-primary-foreground shadow-elegant transition hover:brightness-105 disabled:opacity-50"
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
  areas, procs, areaId, setAreaId, procedureId, setProcedureId, onBack, onNext,
}: {
  areas: Area[]; procs: Procedure[];
  areaId: string | null; setAreaId: (v: string) => void;
  procedureId: string | null; setProcedureId: (v: string) => void;
  onBack: () => void; onNext: () => void;
}) {
  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Cambiar CI
      </button>
      <h1 className="mt-2 text-2xl font-bold">Selecciona el trámite</h1>

      <div className="mt-6">
        <label className="text-sm font-medium">Área</label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {areas.map((a) => (
            <button key={a.id} onClick={() => setAreaId(a.id)}
              className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${areaId === a.id ? "border-primary bg-primary text-primary-foreground shadow-elegant" : "border-border bg-background hover:border-primary/50"}`}>
              {a.name}
            </button>
          ))}
        </div>
      </div>

      {areaId && (
        <div className="mt-5">
          <label className="text-sm font-medium">Trámite</label>
          <div className="mt-2 flex flex-col gap-2">
            {procs.map((p) => (
              <button key={p.id} onClick={() => setProcedureId(p.id)}
                className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${procedureId === p.id ? "border-primary bg-accent" : "border-border bg-background hover:border-primary/40"}`}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <button onClick={onNext} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary py-3.5 text-lg font-semibold text-primary-foreground shadow-elegant hover:brightness-105">
        Continuar <ArrowRight className="h-5 w-5" />
      </button>
    </div>
  );
}

function StepConfirm({ ci, area, proc, onBack, onConfirm, loading }: { ci: string; area: Area; proc: Procedure; onBack: () => void; onConfirm: () => void; loading: boolean }) {
  const now = new Date();
  return (
    <div>
      <h1 className="text-2xl font-bold">Confirma tu turno</h1>
      <dl className="mt-6 divide-y divide-border rounded-2xl border border-border">
        <Row label="CI" value={ci} />
        <Row label="Área" value={area.name} />
        <Row label="Trámite" value={proc.name} />
        <Row label="Fecha" value={now.toLocaleDateString("es-BO")} />
        <Row label="Hora" value={now.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })} />
      </dl>
      <div className="mt-6 flex flex-col gap-2">
        <button onClick={onConfirm} disabled={loading} className="rounded-xl bg-gradient-primary py-3.5 font-semibold text-primary-foreground shadow-elegant hover:brightness-105 disabled:opacity-50">
          {loading ? "Generando..." : "Confirmar y generar ticket"}
        </button>
        <button onClick={onBack} className="rounded-xl border border-border py-3 font-medium hover:bg-accent">
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
