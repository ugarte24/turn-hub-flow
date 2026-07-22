import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchTodayTickets } from "@/lib/sigat-queries";
import { formatTicketCode } from "@/lib/ticket-code";
import { Volume2, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/display")({
  head: () => ({ meta: [{ title: "Pantalla — SIGAT" }, { name: "robots", content: "noindex" }] }),
  component: DisplayPage,
});

type TicketRow = {
  id: string; code: string; status: string; called_at: string | null;
  area?: { name: string } | null;
  procedure?: { name: string } | null;
  service_point?: { name: string } | null;
};

function abbreviateDeskName(name: string | null | undefined) {
  if (!name) return "—";
  return name
    .replace(/\boperador(es)?\b/gi, "Op.")
    .replace(/\brecaudaciones\b/gi, "Rec.");
}

/** Escala tipográfica de la lista “en atención” según cantidad de filas. */
function attendingTypeScale(count: number) {
  if (count <= 2) {
    return {
      gap: "gap-2",
      row: "grid-cols-[6.5rem_2.75rem_minmax(0,1fr)] gap-x-3 px-4 py-3 md:grid-cols-[8rem_3rem_minmax(0,1fr)]",
      code: "text-[clamp(3.25rem,10vh,6.5rem)]",
      desk: "text-2xl md:text-3xl lg:text-4xl",
      arrow: "h-9 w-9 md:h-11 md:w-11",
    };
  }
  if (count <= 4) {
    return {
      gap: "gap-2",
      row: "grid-cols-[5.5rem_2.5rem_minmax(0,1fr)] gap-x-3 px-4 py-2.5 md:grid-cols-[7rem_2.75rem_minmax(0,1fr)]",
      code: "text-[clamp(2.75rem,8vh,5rem)]",
      desk: "text-xl md:text-2xl lg:text-3xl",
      arrow: "h-8 w-8 md:h-10 md:w-10",
    };
  }
  if (count <= 6) {
    return {
      gap: "gap-2",
      row: "grid-cols-[4.75rem_2.25rem_minmax(0,1fr)] gap-x-2 px-3 py-2 md:grid-cols-[6rem_2.5rem_minmax(0,1fr)]",
      code: "text-[clamp(2.25rem,6.5vh,4.25rem)]",
      desk: "text-lg md:text-xl lg:text-2xl",
      arrow: "h-7 w-7 md:h-8 md:w-8",
    };
  }
  if (count <= 8) {
    return {
      gap: "gap-1.5",
      row: "grid-cols-[4.25rem_2rem_minmax(0,1fr)] gap-x-2 px-3 py-1.5 md:grid-cols-[5.25rem_2.25rem_minmax(0,1fr)]",
      code: "text-[clamp(1.9rem,5vh,3.25rem)]",
      desk: "text-base md:text-lg lg:text-xl",
      arrow: "h-6 w-6 md:h-7 md:w-7",
    };
  }
  return {
    gap: "gap-1",
    row: "grid-cols-[3.5rem_1.75rem_minmax(0,1fr)] gap-x-1.5 px-2.5 py-1 md:grid-cols-[4.5rem_2rem_minmax(0,1fr)]",
    code: "text-[clamp(1.5rem,3.8vh,2.4rem)]",
    desk: "text-sm md:text-base lg:text-lg",
    arrow: "h-5 w-5 md:h-6 md:w-6",
  };
}

type TvSettings = {
  institution: string;
  subtitle: string;
  videoEnabled: boolean;
  videoSource: "none" | "file" | "youtube" | "url" | "iframe";
  videoUrl: string;
  voiceEnabled: boolean;
};

const defaultTv: TvSettings = {
  institution: "Jefatura de Recaudaciones",
  subtitle: "Sistema Integral de Gestión de Atención por Turnos",
  videoEnabled: false,
  videoSource: "none",
  videoUrl: "",
  voiceEnabled: true,
};

/** Audio compartido de la TV (el navegador exige un clic para habilitarlo). */
let tvAudioCtx: AudioContext | null = null;

function getTvAudioContext(): AudioContext | null {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!tvAudioCtx || tvAudioCtx.state === "closed") tvAudioCtx = new Ctx();
    return tvAudioCtx;
  } catch {
    return null;
  }
}

async function unlockTvAudio(): Promise<boolean> {
  const ctx = getTvAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    // Pulso silencioso para “desbloquear” el audio en algunos navegadores
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
    // Algunos navegadores tardan un tick en pasar a running
    if (ctx.state !== "running") await ctx.resume();
    return ctx.state === "running";
  } catch {
    return false;
  }
}

/** Ding corto (un solo tono) antes del anuncio de voz. */
function playCallDing() {
  const ctx = getTvAudioContext();
  if (!ctx) return;

  const play = () => {
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(988, now);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.55, now + 0.02);
      g.gain.linearRampToValueAtTime(0, now + 0.35);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    } catch { /* ignore */ }
  };

  if (ctx.state === "suspended") {
    void ctx.resume().then(() => play());
    return;
  }
  play();
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Clave estable por ticket+called_at (segundo). */
function callAnnounceKey(id: string, calledAt: string) {
  const ms = new Date(calledAt).getTime();
  const sec = Number.isFinite(ms) ? Math.floor(ms / 1000) : calledAt;
  return `${id}:${sec}`;
}

/** Cola global: un ding + una voz por llamado, nunca en paralelo ni duplicado. */
const announcedCallKeys = new Set<string>();
/** Evita re-encolar el mismo ticket mientras suena o acaba de sonar. */
const ticketAnnounceLock = new Set<string>();
let announceChain: Promise<void> = Promise.resolve();
let highlightingCallId: string | null = null;
const highlightListeners = new Set<(id: string | null) => void>();
/** Evita que speak() se dispare dos veces (bug frecuente de Chrome). */
let speakInFlight = false;
let lastSpokenText = "";
let lastSpokenAt = 0;

function setHighlightingCallId(id: string | null) {
  highlightingCallId = id;
  for (const fn of highlightListeners) fn(id);
}

function waitSpeechIdle(maxMs = 15_000): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      try {
        const busy = speechSynthesis.speaking || speechSynthesis.pending;
        if (!busy || Date.now() - started > maxMs) {
          resolve();
          return;
        }
      } catch {
        resolve();
        return;
      }
      window.setTimeout(tick, 120);
    };
    tick();
  });
}

function speakOnce(text: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        resolve();
        return;
      }

      const now = Date.now();
      const normalized = text.trim().toLowerCase();
      // Misma frase otra vez en < 6s → ignorar (doble disparo / bug Chrome)
      if (normalized === lastSpokenText && now - lastSpokenAt < 6000) {
        resolve();
        return;
      }
      if (speakInFlight) {
        resolve();
        return;
      }

      speakInFlight = true;
      lastSpokenText = normalized;
      lastSpokenAt = now;

      const synth = window.speechSynthesis;
      // Vaciar cola residual del motor (sin cancelar a mitad de esta frase)
      if (synth.pending && !synth.speaking) {
        try { synth.cancel(); } catch { /* ignore */ }
      }

      const msg = new SpeechSynthesisUtterance(text);
      // Solo lang: asignar voice distinto al lang duplica el audio en Chrome/Edge Windows
      msg.lang = "es-ES";
      msg.rate = 0.9;
      msg.volume = 1;
      msg.pitch = 1;

      let settled = false;
      let started = false;
      const done = () => {
        if (settled) return;
        settled = true;
        speakInFlight = false;
        resolve();
      };
      msg.onstart = () => {
        // Si el motor dispara un segundo start de la misma utterance, cortar
        if (started) {
          try { synth.cancel(); } catch { /* ignore */ }
          done();
          return;
        }
        started = true;
      };
      msg.onend = done;
      msg.onerror = done;

      synth.speak(msg);
      window.setTimeout(done, 10_000);
    } catch {
      speakInFlight = false;
      resolve();
    }
  });
}

async function playAnnounceSequence(ticketId: string, code: string, desk: string) {
  setHighlightingCallId(ticketId);
  try {
    await unlockTvAudio();
    await waitSpeechIdle();
    playCallDing();
    await sleep(550);
    await speakOnce(`Turno ${code} pasar a ${desk}`);
    await waitSpeechIdle();
    await sleep(700);
  } finally {
    setHighlightingCallId(null);
  }
}

function enqueueCallAnnounce(key: string, ticketId: string, code: string, desk: string) {
  if (announcedCallKeys.has(key)) return;
  if (ticketAnnounceLock.has(ticketId)) {
    // Ya en cola / sonando: marcar clave para no reintentar
    announcedCallKeys.add(key);
    return;
  }

  announcedCallKeys.add(key);
  ticketAnnounceLock.add(ticketId);

  announceChain = announceChain
    .then(async () => {
      try {
        await playAnnounceSequence(ticketId, code, desk);
      } finally {
        // Ventana anti-rebote tras el anuncio (realtime duplicado)
        await sleep(2000);
        ticketAnnounceLock.delete(ticketId);
      }
    })
    .catch(() => {
      ticketAnnounceLock.delete(ticketId);
      setHighlightingCallId(null);
      speakInFlight = false;
    });
}

function DisplayPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [ticketsReady, setTicketsReady] = useState(false);
  const [now, setNow] = useState(new Date());
  const [tv, setTv] = useState<TvSettings>(defaultTv);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const announceSeededRef = useRef(false);

  useEffect(() => {
    // Al montar / recargar: apagar cualquier parpadeo residual
    setHighlightingCallId(null);
    setHighlightId(null);
    highlightListeners.add(setHighlightId);
    return () => {
      highlightListeners.delete(setHighlightId);
      setHighlightingCallId(null);
    };
  }, []);

  // Desbloquea audio en silencio (sin overlay) ante cualquier interacción / al cargar
  useEffect(() => {
    void unlockTvAudio();
    try {
      const synth = window.speechSynthesis;
      synth.getVoices();
      if (synth.paused) synth.resume();
    } catch { /* ignore */ }

    const unlock = () => {
      void unlockTvAudio();
      try {
        const synth = window.speechSynthesis;
        if (synth.paused) synth.resume();
        synth.getVoices();
      } catch { /* ignore */ }
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadTickets() {
      const data = await fetchTodayTickets();
      if (mounted) {
        setTickets(data as TicketRow[]);
        setTicketsReady(true);
      }
    }
    async function loadSettings() {
      const { data } = await supabase.from("settings").select("*");
      if (!mounted || !data) return;
      const tvRow = data.find((r) => r.key === "tv_display")?.value as Record<string, unknown> | undefined;
      const soundRow = data.find((r) => r.key === "sound")?.value as Record<string, unknown> | undefined;
      setTv({
        institution: String(tvRow?.institution || defaultTv.institution),
        subtitle: String(tvRow?.subtitle || defaultTv.subtitle),
        videoEnabled: Boolean(tvRow?.videoEnabled),
        videoSource: (tvRow?.videoSource as TvSettings["videoSource"]) ?? "none",
        videoUrl: String(tvRow?.videoUrl ?? ""),
        voiceEnabled: soundRow?.voice !== false,
      });
    }
    loadTickets();
    loadSettings();
    const channel = supabase
      .channel("tv-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => loadTickets())
      .subscribe();
    const poll = setInterval(loadSettings, 20000);
    return () => {
      mounted = false;
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, []);

  const calling = tickets.filter((t) => t.status === "calling");
  const inService = tickets.filter((t) => t.status === "in_service");
  // Orden estable: al llamar o repetir, el turno no salta de fila
  const attendingOrderRef = useRef<string[]>([]);
  const attendingActive = [...calling, ...inService];
  const attendingIds = new Set(attendingActive.map((t) => t.id));
  attendingOrderRef.current = attendingOrderRef.current.filter((id) => attendingIds.has(id));
  for (const t of attendingActive) {
    if (!attendingOrderRef.current.includes(t.id)) {
      attendingOrderRef.current.push(t.id);
    }
  }
  const attendingById = new Map(attendingActive.map((t) => [t.id, t]));
  const attending = attendingOrderRef.current
    .map((id) => attendingById.get(id))
    .filter((t): t is TicketRow => !!t);
  const attendingScale = attendingTypeScale(attending.length);
  const showVideo = tv.videoEnabled && tv.videoUrl.trim().length > 0 && tv.videoSource !== "none";
  const waiting = tickets.filter((t) => t.status === "waiting");
  const upcoming = waiting.slice(-23).reverse();
  const moreWaiting = waiting.length - upcoming.length;
  // Firma estable: evita re-ejecutar el anuncio en cada tick del reloj
  const callingSignature = calling
    .map((t) => `${t.id}:${t.called_at ?? ""}`)
    .sort()
    .join("|");

  useEffect(() => {
    if (!tv.voiceEnabled || !ticketsReady) return;

    // Primera carga tras recargar: no re-anunciar ni parpadear turnos ya en pantalla
    if (!announceSeededRef.current) {
      for (const t of calling) {
        if (t.called_at) announcedCallKeys.add(callAnnounceKey(t.id, t.called_at));
      }
      announceSeededRef.current = true;
      setHighlightingCallId(null);
      return;
    }

    const fresh = calling
      .filter((t) => t.called_at)
      .map((t) => {
        const calledAt = t.called_at!;
        const key = callAnnounceKey(t.id, calledAt);
        const at = new Date(calledAt).getTime();
        return { t, key, at };
      })
      .sort((a, b) => a.at - b.at);

    for (const item of fresh) {
      if (announcedCallKeys.has(item.key)) continue;
      enqueueCallAnnounce(
        item.key,
        item.t.id,
        formatTicketCode(item.t.code),
        item.t.service_point?.name ?? "atención",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- calling se refleja en callingSignature
  }, [callingSignature, tv.voiceEnabled, ticketsReady]);

  return (
    <div className="relative h-screen max-h-screen overflow-hidden bg-gradient-tv text-white">
      <div className="grid h-full grid-cols-1 md:grid-cols-[1.55fr_1fr]">
      {/* Izquierda: cabecera + video horizontal + pie */}
      <section className="flex min-h-0 flex-col border-b border-white/10 md:border-b-0 md:border-r md:border-white/10">
        <header className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-white/5 px-4 py-2.5 md:px-5 md:py-3">
          <img src="/sigat-icon.png" alt="SIGAT" className="h-11 w-11 shrink-0 rounded-xl md:h-14 md:w-14" />
          <div className="min-w-0">
            <p className="text-lg font-extrabold uppercase tracking-[0.18em] text-primary-glow md:text-2xl lg:text-3xl">
              {tv.institution || "Jefatura de Recaudaciones"}
            </p>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 items-center justify-center bg-black/20 p-2 md:p-3">
          {showVideo ? (
            <div className="aspect-video w-full max-h-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-elegant">
              <TvMedia source={tv.videoSource} url={tv.videoUrl} />
            </div>
          ) : (
            <div className="flex aspect-video w-full max-h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/20 bg-black/30">
              <img src="/sigat-icon.png" alt="SIGAT" className="h-20 w-20 rounded-2xl opacity-80" />
              <p className="text-white/50">Sin video configurado</p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col border-t border-white/10 bg-white/5 px-3 py-2 md:px-4 md:py-2.5">
          <h2 className="shrink-0 text-[10px] uppercase tracking-widest text-primary-glow md:text-xs">Siguientes turnos</h2>
          <div className="mt-1.5">
            {upcoming.length === 0 ? (
              <p className="text-sm text-white/50">No hay turnos en espera</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {upcoming.map((t) => (
                  <li
                    key={t.id}
                    className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5"
                  >
                    <span className="font-ticket text-2xl font-bold leading-none md:text-3xl">{formatTicketCode(t.code)}</span>
                  </li>
                ))}
                {moreWaiting > 0 && (
                  <li className="flex items-center rounded-lg border border-dashed border-primary-glow/40 bg-primary-glow/10 px-3 py-1.5">
                    <span className="font-ticket text-2xl font-bold leading-none text-primary-glow md:text-3xl">
                      +{moreWaiting}
                    </span>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Derecha: reloj + todos los turnos en atención */}
      <section className="flex min-h-0 flex-col gap-2 overflow-hidden p-3 md:gap-3 md:p-4">
        <div className="flex shrink-0 items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-primary-glow md:text-xs">
            <Volume2 className="h-3.5 w-3.5" /> Turnos en atención
          </div>
          <div className="text-right">
            <p className="font-mono text-xl font-extrabold leading-none text-primary-glow md:text-2xl">
              {now.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
            </p>
            <p className="mt-0.5 text-[10px] capitalize text-white/50 md:text-[11px]">
              {now.toLocaleDateString("es-BO", { weekday: "long", day: "2-digit", month: "long" })}
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-2 md:p-3">
          {attending.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-center text-xl text-white/50 md:text-2xl">Sin turnos en atención</p>
            </div>
          ) : (
            <ul className={`flex min-h-0 flex-1 flex-col overflow-hidden ${attendingScale.gap}`}>
              {attending.map((t) => {
                // Solo parpadea el turno que se está anunciando ahora
                const isAnimating = highlightId === t.id;
                return (
                  <li
                    key={t.id}
                    className={`grid min-h-0 min-w-0 flex-1 items-center overflow-hidden rounded-2xl border ${attendingScale.row} ${
                      isAnimating
                        ? "border-primary-glow/70 bg-primary/25 animate-tv-call-burst"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <span
                      className={`min-w-0 truncate font-ticket font-black leading-none text-amber-300 drop-shadow-[0_0_14px_rgba(251,191,36,0.55)] ${attendingScale.code} ${
                        isAnimating ? "animate-tv-call-code-burst" : ""
                      }`}
                    >
                      {formatTicketCode(t.code)}
                    </span>
                    <span className="flex items-center justify-center">
                      <ArrowRight
                        className={`${attendingScale.arrow} text-amber-300/90`}
                        strokeWidth={3}
                        aria-hidden
                      />
                    </span>
                    <span className={`min-w-0 text-right font-bold uppercase leading-tight tracking-wide text-white/90 break-words ${attendingScale.desk}`}>
                      {abbreviateDeskName(t.service_point?.name)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
      </div>
    </div>
  );
}

function TvMedia({ source, url }: { source: TvSettings["videoSource"]; url: string }) {
  const youtubeId = useMemo(() => extractYoutubeId(url), [url]);
  const frameClass = "h-full w-full border-0";

  if (source === "youtube" && youtubeId) {
    const embed = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${youtubeId}&rel=0&modestbranding=1&playsinline=1`;
    return (
      <iframe
        title="Video TV"
        src={embed}
        className={frameClass}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    );
  }

  if (source === "url" || source === "file") {
    return (
      <video
        className="h-full w-full object-contain"
        src={url}
        autoPlay
        muted
        loop
        playsInline
        controls={false}
      />
    );
  }

  if (source === "iframe") {
    return (
      <iframe
        title="Contenido TV"
        src={url}
        className={`${frameClass} bg-white`}
        sandbox="allow-scripts allow-same-origin allow-presentation"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div className="flex h-full items-center justify-center text-white/50">
      No se pudo cargar el video.
    </div>
  );
}

function extractYoutubeId(input: string): string | null {
  const u = input.trim();
  if (!u) return null;
  if (/^[\w-]{11}$/.test(u)) return u;
  try {
    const url = new URL(u);
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id?.slice(0, 11) ?? null;
    }
    if (url.hostname.includes("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v) return v;
      const parts = url.pathname.split("/");
      const embedIdx = parts.indexOf("embed");
      if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];
      const shortsIdx = parts.indexOf("shorts");
      if (shortsIdx >= 0 && parts[shortsIdx + 1]) return parts[shortsIdx + 1];
    }
  } catch {
    return null;
  }
  return null;
}
