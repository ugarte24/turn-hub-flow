import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, Monitor, ArrowRight } from "lucide-react";
import { APP_VERSION_LABEL } from "@/lib/version";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Sacar turno — SIGAT" }] }),
  component: CitizenLanding,
});

function CitizenLanding() {
  return (
    <div className="min-h-dvh bg-background pb-[env(safe-area-inset-bottom)]">
      <header className="relative overflow-hidden bg-gradient-hero text-white">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_20%,white_1px,transparent_1px),radial-gradient(circle_at_80%_60%,white_1px,transparent_1px)] [background-size:32px_32px,48px_48px]" />
        <div className="absolute left-5 top-[max(1.25rem,env(safe-area-inset-top))] z-10 flex items-center gap-2.5 text-[11px] font-medium uppercase tracking-widest text-white/80 md:left-6 md:top-6 md:gap-3 md:text-sm">
          <img src="/sigat-icon.png" alt="SIGAT" className="h-9 w-9 rounded-xl shadow-elegant md:h-10 md:w-10" />
          Jefatura de Recaudaciones
        </div>
        <div className="relative mx-auto flex min-h-[100dvh] max-w-6xl flex-col items-center justify-center px-5 py-10 text-center md:min-h-[72vh] md:items-start md:px-6 md:py-20 md:text-left">
          <p className="max-w-md text-base leading-snug text-white/85 md:max-w-xl md:text-xl">
            Sacá tu turno con tu CI y esperá el llamado en pantalla. Sin filas, sin confusión.
          </p>
          <div className="mt-7 w-full max-w-md md:mt-10 md:max-w-none">
            <Link
              to="/ticket"
              className="animate-cta-attract inline-flex w-full items-center justify-center gap-3 rounded-full bg-gradient-to-r from-primary-glow via-white to-primary-glow px-8 py-5 text-xl font-extrabold uppercase tracking-wide text-primary shadow-elegant transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40 md:w-auto md:px-10 md:py-5 md:text-xl"
            >
              Sacar turno
            </Link>
            <p className="mt-3 text-sm text-white/70 md:mt-4">Tocá el botón para comenzar</p>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-8 md:px-6 md:py-14">
        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
          <div className="rounded-2xl border border-border bg-card p-4 md:p-6">
            <Clock className="h-7 w-7 text-primary md:h-8 md:w-8" />
            <h2 className="mt-3 text-lg font-bold md:mt-4 md:text-xl">¿Cómo funciona?</h2>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground md:mt-3 md:space-y-2">
              <li>Ingresá tu número de CI.</li>
              <li>Elegí el área y el trámite.</li>
              <li>Esperá tu llamado en la pantalla TV.</li>
            </ol>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 md:p-6">
            <Monitor className="h-7 w-7 text-primary md:h-8 md:w-8" />
            <h2 className="mt-3 text-lg font-bold md:mt-4 md:text-xl">En la sala de espera</h2>
            <p className="mt-2 text-sm text-muted-foreground md:mt-3">
              Prestá atención a la pantalla y al anuncio de voz. Cuando salga tu número, acercate al puesto indicado.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-border px-5 py-6 text-center text-sm text-muted-foreground md:py-8">
        <p>© {new Date().getFullYear()} Jefatura de Recaudaciones — {APP_VERSION_LABEL}</p>
        <Link to="/staff" className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground/80 hover:text-foreground md:mt-3">
          Acceso funcionarios <ArrowRight className="h-3 w-3" />
        </Link>
      </footer>
    </div>
  );
}
