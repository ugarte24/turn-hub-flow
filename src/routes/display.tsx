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
  subtitle: "SIGAT · Atención por turnos",
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
        institution: String(tvRow?.institution ?? defaultTv.institution),
        subtitle: String(tvRow?.subtitle ?? defaultTv.subtitle),
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
  const upcoming = tickets.filter((t) => t.status === "waiting").slice(-8).reverse();

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

  const showVideo = tv.videoEnabled && tv.videoUrl.trim().length > 0 && tv.videoSource !== "none";

  return (
    <div className="flex min-h-screen flex-col bg-gradient-tv text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-5">
        <div>
          <div className="flex items-center gap-3">
            <img src="/sigat-icon.png" alt="SIGAT" className="h-12 w-12 rounded-2xl shadow-elegant" />
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">{tv.institution}</p>
              <h1 className="text-2xl font-bold md:text-3xl">{tv.subtitle || "SIGAT · Atención por turnos"}</h1>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-3xl font-extrabold text-primary-glow md:text-5xl">
            {now.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
          <p className="text-sm text-white/60">
            {now.toLocaleDateString("es-BO", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>
      </header>

      <main className={`grid flex-1 gap-6 p-6 md:grid-cols-3 md:p-8 ${showVideo ? "auto-rows-fr" : ""}`}>
        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur md:col-span-2">
          <div className="flex items-center gap-2 text-sm uppercase tracking-widest text-primary-glow">
            <Volume2 className="h-4 w-4" /> Turno en atención
          </div>
          {current ? (
            <div className="mt-6">
              <div className={`font-ticket font-black leading-none text-primary-glow drop-shadow-[0_0_40px_rgba(61,190,139,0.5)] ${showVideo ? "text-7xl md:text-8xl" : "text-[10rem] md:text-[14rem]"}`}>
                {current.code}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Badge>{current.service_point?.name ?? "—"}</Badge>
                <Badge subtle>{current.area?.name}</Badge>
                <Badge subtle>{current.procedure?.name}</Badge>
              </div>
            </div>
          ) : (
            <div className={`text-center text-2xl text-white/50 ${showVideo ? "mt-8" : "mt-16"}`}>
              Sin turnos en atención
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <h2 className="text-sm uppercase tracking-widest text-white/70">Siguientes turnos</h2>
          <ul className="mt-4 space-y-2">
            {upcoming.length === 0 && (
              <li className="rounded-xl border border-white/10 px-4 py-3 text-center text-white/50">
                No hay turnos en espera
              </li>
            )}
            {upcoming.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <span className="font-ticket text-2xl font-bold">{t.code}</span>
                <span className="text-sm text-white/70">{t.procedure?.name}</span>
              </li>
            ))}
          </ul>

          <h3 className="mt-6 text-sm uppercase tracking-widest text-white/70">En atención</h3>
          <ul className="mt-3 space-y-2">
            {inService.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-2 text-sm">
                <span className="font-ticket font-bold">{t.code}</span>
                <span className="text-white/70">{t.service_point?.name}</span>
              </li>
            ))}
          </ul>
        </section>

        {showVideo && (
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-black/40 md:col-span-3">
            <TvMedia source={tv.videoSource} url={tv.videoUrl} />
          </section>
        )}
      </main>
    </div>
  );
}

function TvMedia({ source, url }: { source: TvSettings["videoSource"]; url: string }) {
  const youtubeId = useMemo(() => extractYoutubeId(url), [url]);

  if (source === "youtube" && youtubeId) {
    const embed = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${youtubeId}&rel=0&modestbranding=1&playsinline=1`;
    return (
      <iframe
        title="Video TV"
        src={embed}
        className="aspect-video w-full border-0 md:min-h-[40vh]"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    );
  }

  if (source === "url" || source === "file") {
    return (
      <video
        className="aspect-video w-full object-contain md:min-h-[40vh]"
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
        className="aspect-video w-full border-0 bg-white md:min-h-[40vh]"
        sandbox="allow-scripts allow-same-origin allow-presentation"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div className="flex aspect-video items-center justify-center text-white/50 md:min-h-[40vh]">
      No se pudo cargar el video. Revisa la URL en Configuración.
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
    <span className={`rounded-full px-4 py-1.5 text-lg font-semibold ${subtle ? "border border-white/20 text-white/80" : "bg-primary-glow text-primary"}`}>
      {children}
    </span>
  );
}

function spellCode(code: string) {
  const letters: Record<string, string> = { V: "Vehículo", I: "Inmueble", A: "Actividades", T: "Tasas" };
  const [l, n] = code.split("-");
  return `${letters[l] ?? l} ${parseInt(n, 10)}`;
}
