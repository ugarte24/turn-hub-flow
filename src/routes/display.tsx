import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

function DisplayPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [now, setNow] = useState(new Date());
  const [lastAnnounced, setLastAnnounced] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const data = await fetchTodayTickets();
      if (mounted) setTickets(data as TicketRow[]);
    }
    load();
    const channel = supabase
      .channel("tv-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => load())
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, []);

  const calling = tickets.filter((t) => t.status === "calling");
  const inService = tickets.filter((t) => t.status === "in_service");
  const current = calling[0] ?? inService[0] ?? null;
  const upcoming = tickets.filter((t) => t.status === "waiting").slice(-8).reverse();

  // Voice announcement when new "calling"
  useEffect(() => {
    if (!calling.length) return;
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
  }, [calling, lastAnnounced]);

  return (
    <div className="min-h-screen bg-gradient-tv text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-5">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">Jefatura de Recaudaciones</p>
          <h1 className="text-2xl font-bold md:text-3xl">SIGAT · Atención por turnos</h1>
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

      <main className="grid gap-6 p-6 md:grid-cols-3 md:p-8">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur md:col-span-2">
          <div className="flex items-center gap-2 text-sm uppercase tracking-widest text-primary-glow">
            <Volume2 className="h-4 w-4" /> Turno en atención
          </div>
          {current ? (
            <div className="mt-6">
              <div className="font-mono text-[10rem] font-black leading-none text-primary-glow drop-shadow-[0_0_40px_rgba(61,190,139,0.5)] md:text-[14rem]">
                {current.code}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Badge>{current.service_point?.name ?? "—"}</Badge>
                <Badge subtle>{current.area?.name}</Badge>
                <Badge subtle>{current.procedure?.name}</Badge>
              </div>
            </div>
          ) : (
            <div className="mt-16 text-center text-2xl text-white/50">Sin turnos en atención</div>
          )}
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <h2 className="text-sm uppercase tracking-widest text-white/70">Siguientes turnos</h2>
          <ul className="mt-4 space-y-2">
            {upcoming.length === 0 && <li className="rounded-xl border border-white/10 px-4 py-3 text-center text-white/50">No hay turnos en espera</li>}
            {upcoming.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <span className="font-mono text-2xl font-bold">{t.code}</span>
                <span className="text-sm text-white/70">{t.procedure?.name}</span>
              </li>
            ))}
          </ul>

          <h3 className="mt-6 text-sm uppercase tracking-widest text-white/70">En atención</h3>
          <ul className="mt-3 space-y-2">
            {inService.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-2 text-sm">
                <span className="font-mono font-bold">{t.code}</span>
                <span className="text-white/70">{t.service_point?.name}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
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
