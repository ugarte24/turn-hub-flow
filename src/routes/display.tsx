import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchTodayTickets } from "@/lib/sigat-queries";
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
  const [lastAnnounced, setLastAnnounced] = useState<string | null>(null);
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
  const current = calling[0] ?? inService[0] ?? null;
  const showVideo = tv.videoEnabled && tv.videoUrl.trim().length > 0 && tv.videoSource !== "none";
  const upcoming = tickets.filter((t) => t.status === "waiting").slice(-6).reverse();

  useEffect(() => {
    if (!tv.voiceEnabled || !calling.length) return;
    const latest = calling[0];
    if (!latest || latest.id === lastAnnounced) return;
    setLastAnnounced(latest.id);
    try {
      const msg = new SpeechSynthesisUtterance(
        `Turno ${spellCode(latest.code)}, favor pasar a ${latest.service_point?.name ?? "atención"}`,
      );
      msg.lang = "es-ES";
      msg.rate = 0.95;
      speechSynthesis.cancel();
      speechSynthesis.speak(msg);
    } catch { /* ignore */ }
  }, [calling, lastAnnounced, tv.voiceEnabled]);

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
                    <span className="font-ticket text-2xl font-bold md:text-3xl">{t.code}</span>
                    <span className="truncate text-xs text-white/70 md:text-sm">{t.procedure?.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Derecha: reloj + turno actual + en atención */}
      <section className="flex min-h-0 flex-col gap-3 overflow-hidden p-4 md:gap-4 md:p-5">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary-glow md:text-sm">
            <Volume2 className="h-4 w-4" /> Turno en atención
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-extrabold leading-none text-primary-glow md:text-4xl">
              {now.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
            <p className="mt-1 text-[11px] capitalize text-white/55 md:text-xs">
              {now.toLocaleDateString("es-BO", { weekday: "long", day: "2-digit", month: "long" })}
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-[1.6] flex-col justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 md:rounded-3xl md:p-6">
          {current ? (
            <div>
              <div className="font-ticket text-[clamp(3.5rem,16vh,9rem)] font-black leading-none text-primary-glow drop-shadow-[0_0_40px_rgba(61,190,139,0.5)]">
                {current.code}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 md:mt-4">
                <Badge>{current.service_point?.name ?? "—"}</Badge>
                <Badge subtle>{current.area?.name}</Badge>
                <Badge subtle>{current.procedure?.name}</Badge>
              </div>
            </div>
          ) : (
            <p className="text-center text-xl text-white/50 md:text-2xl">Sin turnos en atención</p>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 md:rounded-3xl md:p-5">
          <h3 className="shrink-0 text-xs uppercase tracking-widest text-white/70 md:text-sm">En atención</h3>
          <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
            {inService.length === 0 && (
              <li className="rounded-xl border border-white/10 px-3 py-3 text-center text-sm text-white/50">—</li>
            )}
            {inService.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm">
                <span className="font-ticket text-xl font-bold">{t.code}</span>
                <span className="truncate text-white/70">{t.service_point?.name}</span>
              </li>
            ))}
          </ul>
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

function Badge({ children, subtle }: { children: React.ReactNode; subtle?: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-sm font-semibold md:px-4 md:text-base ${
        subtle ? "border border-white/20 text-white/80" : "bg-primary-glow text-primary"
      }`}
    >
      {children}
    </span>
  );
}

function spellCode(code: string) {
  const letters: Record<string, string> = { V: "Vehículo", I: "Inmueble", A: "Actividades", T: "Tasas" };
  const [l, n] = code.split("-");
  return `${letters[l] ?? l} ${parseInt(n, 10)}`;
}
