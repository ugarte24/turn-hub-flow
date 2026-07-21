import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchTodayTickets } from "@/lib/sigat-queries";
import { formatTicketCode } from "@/lib/ticket-code";
import { Volume2 } from "lucide-react";

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
    return ctx.state === "running";
  } catch {
    return false;
  }
}

/** Ding corto antes del anuncio de voz. */
function playCallDing() {
  const ctx = getTvAudioContext();
  if (!ctx) return;

  const play = () => {
    try {
      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0, now);
      master.gain.linearRampToValueAtTime(0.55, now + 0.01);
      master.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      master.connect(ctx.destination);

      for (const [freq, start, peak] of [
        [880, 0, 0.7],
        [1318.5, 0.07, 0.45],
      ] as const) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + start);
        g.gain.setValueAtTime(0.0001, now + start);
        g.gain.exponentialRampToValueAtTime(peak, now + start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.4);
        osc.connect(g);
        g.connect(master);
        osc.start(now + start);
        osc.stop(now + start + 0.45);
      }
    } catch { /* ignore */ }
  };

  if (ctx.state === "suspended") {
    void ctx.resume().then(() => {
      if (ctx.state === "running") play();
    });
    return;
  }
  play();
}

/** Claves ya anunciadas (sobrevive re-mounts de React Strict Mode). */
const announcedCallKeys = new Set<string>();

function DisplayPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [now, setNow] = useState(new Date());
  const [tv, setTv] = useState<TvSettings>(defaultTv);
  const [soundReady, setSoundReady] = useState(() => {
    try {
      return sessionStorage.getItem("sigat_tv_sound") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!soundReady) return;
    void unlockTvAudio().then((ok) => {
      if (!ok) setSoundReady(false);
    });
  }, [soundReady]);

  async function enableSound() {
    const ok = await unlockTvAudio();
    if (!ok) return;
    try {
      sessionStorage.setItem("sigat_tv_sound", "1");
    } catch { /* ignore */ }
    setSoundReady(true);
    playCallDing();
  }

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadTickets() {
      const data = await fetchTodayTickets();
      if (mounted) setTickets(data as TicketRow[]);
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
  // Llamando (más reciente arriba), luego en atención
  const callingSorted = [...calling].sort(
    (a, b) => new Date(b.called_at ?? 0).getTime() - new Date(a.called_at ?? 0).getTime(),
  );
  const attending = [...callingSorted, ...inService];
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
    if (!tv.voiceEnabled) return;

    const nowMs = Date.now();
    const FRESH_MS = 20_000;
    const pending: { t: TicketRow; key: string; at: number }[] = [];

    for (const t of calling) {
      if (!t.called_at) continue;
      const key = `${t.id}:${t.called_at}`;
      if (announcedCallKeys.has(key)) continue;
      const at = new Date(t.called_at).getTime();
      // Al cargar la TV, no re-anuncia llamados antiguos
      if (nowMs - at > FRESH_MS) {
        announcedCallKeys.add(key);
        continue;
      }
      pending.push({ t, key, at });
    }

    // Limpia claves de turnos que ya no están llamando
    const live = new Set(calling.map((t) => `${t.id}:${t.called_at ?? ""}`));
    for (const k of [...announcedCallKeys]) {
      if (!live.has(k)) announcedCallKeys.delete(k);
    }

    if (!pending.length) return;

    // Marca ya como anunciados para no repetir aunque el efecto se re-dispare
    for (const item of pending) announcedCallKeys.add(item.key);

    pending.sort((a, b) => a.at - b.at);
    speechSynthesis.cancel();

    let delayMs = 0;
    for (const item of pending) {
      const speakAt = delayMs;
      const code = formatTicketCode(item.t.code);
      const desk = item.t.service_point?.name ?? "atención";
      window.setTimeout(() => {
        playCallDing();
        window.setTimeout(() => {
          try {
            const msg = new SpeechSynthesisUtterance(`${code}, pasar a ${desk}`);
            msg.lang = "es-ES";
            msg.rate = 0.8;
            speechSynthesis.speak(msg);
          } catch { /* ignore */ }
        }, 550);
      }, speakAt);
      delayMs += 2800;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- calling se refleja en callingSignature
  }, [callingSignature, tv.voiceEnabled]);

  return (
    <div className="relative h-screen max-h-screen overflow-hidden bg-gradient-tv text-white">
      {!soundReady && tv.voiceEnabled && (
        <button
          type="button"
          onClick={() => void enableSound()}
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/80 px-6 text-center backdrop-blur-sm"
        >
          <Volume2 className="h-16 w-16 text-primary-glow" />
          <p className="text-2xl font-extrabold md:text-4xl">Tocá la pantalla para activar el sonido</p>
          <p className="max-w-md text-sm text-white/70 md:text-base">
            El navegador exige un toque para permitir el ding y la voz de los llamados.
          </p>
        </button>
      )}

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
            <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
              {attending.map((t) => {
                const isCalling = t.status === "calling";
                const calledMs = t.called_at ? new Date(t.called_at).getTime() : 0;
                const isAnimating = isCalling && calledMs > 0 && now.getTime() - calledMs < 6000;
                return (
                  <li
                    key={t.id}
                    className={`flex min-h-0 flex-1 items-center justify-between gap-4 rounded-2xl border px-4 py-2 md:px-5 md:py-3 ${
                      isCalling
                        ? isAnimating
                          ? "border-primary-glow/70 bg-primary/25 animate-tv-call-burst"
                          : "border-primary-glow/40 bg-primary/15 shadow-[inset_0_0_24px_rgba(61,190,139,0.2)]"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <span
                      className={`shrink-0 font-ticket text-[clamp(3.5rem,11vh,7.5rem)] font-black leading-none text-primary-glow ${
                        isAnimating ? "animate-tv-call-code-burst" : ""
                      }`}
                    >
                      {formatTicketCode(t.code)}
                    </span>
                    <span className="min-w-0 truncate text-right text-xl font-bold uppercase tracking-wide text-white/90 md:text-3xl lg:text-4xl">
                      {t.service_point?.name ?? "—"}
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
