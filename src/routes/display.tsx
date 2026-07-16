import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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

function DisplayPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [now, setNow] = useState(new Date());
  const announcedKeys = useRef(new Set<string>());
  const [tv, setTv] = useState<TvSettings>(defaultTv);

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
  // Llamando primero, luego en atención; solo número + puesto/operador en pantalla
  const attending = [...calling, ...inService];
  const showVideo = tv.videoEnabled && tv.videoUrl.trim().length > 0 && tv.videoSource !== "none";
  const upcoming = tickets.filter((t) => t.status === "waiting").slice(-6).reverse();

  useEffect(() => {
    if (!tv.voiceEnabled) return;

    const nowMs = Date.now();
    const FRESH_MS = 20_000;
    const pending: { t: TicketRow; key: string; at: number }[] = [];

    for (const t of calling) {
      if (!t.called_at) continue;
      const key = `${t.id}:${t.called_at}`;
      if (announcedKeys.current.has(key)) continue;
      const at = new Date(t.called_at).getTime();
      // Al cargar la TV, no re-anuncia llamados antiguos
      if (nowMs - at > FRESH_MS) {
        announcedKeys.current.add(key);
        continue;
      }
      pending.push({ t, key, at });
    }

    // Limpia claves de turnos que ya no están llamando
    const live = new Set(calling.map((t) => `${t.id}:${t.called_at ?? ""}`));
    for (const k of [...announcedKeys.current]) {
      if (!live.has(k)) announcedKeys.current.delete(k);
    }

    if (!pending.length) return;

    pending.sort((a, b) => a.at - b.at);
    speechSynthesis.cancel();
    for (const item of pending) {
      announcedKeys.current.add(item.key);
      try {
        const msg = new SpeechSynthesisUtterance(
          `${formatTicketCode(item.t.code)}, pasar a ${item.t.service_point?.name ?? "atención"}`,
        );
        msg.lang = "es-ES";
        msg.rate = 0.95;
        speechSynthesis.speak(msg);
      } catch { /* ignore */ }
    }
  }, [calling, tv.voiceEnabled]);

  return (
    <div className="grid h-screen max-h-screen grid-cols-1 overflow-hidden bg-gradient-tv text-white md:grid-cols-[1.55fr_1fr]">
      {/* Izquierda: cabecera + video horizontal + pie */}
      <section className="flex min-h-0 flex-col border-b border-white/10 md:border-b-0 md:border-r md:border-white/10">
        <header className="flex shrink-0 items-center gap-4 border-b border-white/10 bg-white/5 px-5 py-4 md:px-6 md:py-5">
          <img src="/sigat-icon.png" alt="SIGAT" className="h-16 w-16 shrink-0 rounded-2xl md:h-20 md:w-20" />
          <div className="min-w-0">
            <p className="text-xl font-extrabold uppercase tracking-[0.2em] text-primary-glow md:text-3xl lg:text-4xl">
              {tv.institution || "Jefatura de Recaudaciones"}
            </p>
          </div>
        </header>

        <div className="flex min-h-0 flex-[1.15] items-center justify-center bg-black/20 p-3 md:p-4">
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

        <div className="flex min-h-0 flex-[0.75] flex-col overflow-hidden border-t border-white/10 bg-white/5 p-3 md:p-4">
          <h2 className="shrink-0 text-xs uppercase tracking-widest text-primary-glow md:text-sm">Siguientes turnos</h2>
          <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
            {upcoming.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-xl border border-white/10 px-3 py-4 text-sm text-white/50">
                No hay turnos en espera
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {upcoming.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-col justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
                  >
                    <span className="font-ticket text-2xl font-bold md:text-3xl">{formatTicketCode(t.code)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Derecha: reloj + todos los turnos en atención */}
      <section className="flex min-h-0 flex-col gap-3 overflow-hidden p-4 md:gap-4 md:p-5">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary-glow md:text-sm">
            <Volume2 className="h-4 w-4" /> Turnos en atención
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-extrabold leading-none text-primary-glow md:text-4xl">
              {now.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
            </p>
            <p className="mt-1 text-[11px] capitalize text-white/55 md:text-xs">
              {now.toLocaleDateString("es-BO", { weekday: "long", day: "2-digit", month: "long" })}
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-3 md:rounded-3xl md:p-4">
          {attending.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-center text-xl text-white/50 md:text-2xl">Sin turnos en atención</p>
            </div>
          ) : (
            <ul
              className={`min-h-0 flex-1 gap-3 overflow-y-auto grid grid-cols-1 ${
                attending.length <= 2 ? "content-center" : "content-start"
              }`}
            >
              {attending.map((t) => {
                const isCalling = t.status === "calling";
                const big = attending.length <= 2;
                const calledMs = t.called_at ? new Date(t.called_at).getTime() : 0;
                const isAnimating = isCalling && calledMs > 0 && now.getTime() - calledMs < 6000;
                return (
                  <li
                    key={t.id}
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-4 md:px-5 md:py-5 ${
                      isCalling
                        ? isAnimating
                          ? "border-primary-glow/70 bg-primary/25 animate-tv-call-burst"
                          : "border-primary-glow/40 bg-primary/15 shadow-[0_0_30px_rgba(61,190,139,0.25)]"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <span
                      className={`shrink-0 font-ticket font-black leading-none text-primary-glow ${
                        big
                          ? "text-[clamp(2.5rem,8vh,5rem)]"
                          : "text-[clamp(2rem,5vh,3.5rem)]"
                      } ${isAnimating ? "animate-tv-call-code-burst" : ""}`}
                    >
                      {formatTicketCode(t.code)}
                    </span>
                    <span
                      className={`min-w-0 truncate text-right font-semibold uppercase tracking-wide text-white/85 ${
                        big ? "text-sm md:text-lg" : "text-xs md:text-sm"
                      }`}
                    >
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
