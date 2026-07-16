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
  // Llamando (más reciente arriba), luego en atención
  const callingSorted = [...calling].sort(
    (a, b) => new Date(b.called_at ?? 0).getTime() - new Date(a.called_at ?? 0).getTime(),
  );
  const attending = [...callingSorted, ...inService];
  const showVideo = tv.videoEnabled && tv.videoUrl.trim().length > 0 && tv.videoSource !== "none";
  const upcoming = tickets.filter((t) => t.status === "waiting").slice(-10).reverse();

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
            <ul className="grid min-h-0 flex-1 grid-cols-1 content-start gap-2 overflow-y-auto">
              {attending.map((t) => {
                const isCalling = t.status === "calling";
                const calledMs = t.called_at ? new Date(t.called_at).getTime() : 0;
                const isAnimating = isCalling && calledMs > 0 && now.getTime() - calledMs < 6000;
                return (
                  <li
                    key={t.id}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 md:px-4 md:py-3 ${
                      isCalling
                        ? isAnimating
                          ? "border-primary-glow/70 bg-primary/25 animate-tv-call-burst"
                          : "border-primary-glow/40 bg-primary/15 shadow-[0_0_24px_rgba(61,190,139,0.25)]"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <span
                      className={`shrink-0 font-ticket text-[clamp(2.5rem,6vh,4rem)] font-black leading-none text-primary-glow ${
                        isAnimating ? "animate-tv-call-code-burst" : ""
                      }`}
                    >
                      {formatTicketCode(t.code)}
                    </span>
                    <span className="min-w-0 truncate text-right text-sm font-semibold uppercase tracking-wide text-white/85 md:text-base">
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
