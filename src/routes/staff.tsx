import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Monitor, Users2, ArrowRight, LayoutDashboard } from "lucide-react";
import { APP_VERSION_LABEL } from "@/lib/version";

export const Route = createFileRoute("/staff")({
  head: () => ({ meta: [{ title: "Funcionarios — SIGAT" }] }),
  component: StaffLanding,
});

function StaffLanding() {
  return (
    <div className="min-h-dvh bg-background pb-[env(safe-area-inset-bottom)]">
      <header className="relative overflow-hidden bg-gradient-hero text-white">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_20%,white_1px,transparent_1px),radial-gradient(circle_at_80%_60%,white_1px,transparent_1px)] [background-size:32px_32px,48px_48px]" />
        <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-20">
          <div className="flex items-center gap-3 text-sm font-medium uppercase tracking-widest text-white/80">
            <img src="/sigat-icon.png" alt="SIGAT" className="h-10 w-10 rounded-xl shadow-elegant" />
            Panel institucional
          </div>
          <h1 className="mt-5 text-3xl font-extrabold leading-tight sm:mt-6 sm:text-4xl md:text-6xl">
            SIGAT
            <span className="block text-primary-glow">Acceso funcionarios</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base text-white/85 sm:mt-5 sm:text-lg">
            Operadores y administradores: llamá turnos, configurá puestos y seguí la atención en tiempo real.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              to="/auth"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary-glow px-6 py-3 font-semibold text-primary shadow-elegant transition hover:brightness-105 sm:w-auto"
            >
              Iniciar sesión <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/display"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-white/30 bg-white/10 px-6 py-3 font-semibold text-white backdrop-blur transition hover:bg-white/20 sm:w-auto"
            >
              <Monitor className="h-5 w-5" /> Pantalla TV
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-14">
        <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
          {[
            {
              icon: Users2,
              title: "Operador",
              desc: "Llamá el siguiente turno, iniciá atención, finalizá o marcá ausente desde tu puesto.",
            },
            {
              icon: LayoutDashboard,
              title: "Administrador",
              desc: "Gestioná usuarios, áreas, trámites, puestos, video de la TV y el QR de acceso.",
            },
            {
              icon: Monitor,
              title: "Pantalla TV",
              desc: "Mostrá turnos en atención y siguientes en la sala, con anuncio por voz.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-elegant">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-3xl border border-border bg-gradient-primary p-6 text-white shadow-elegant sm:mt-10 md:p-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm uppercase tracking-widest text-white/70">
                <ShieldCheck className="h-4 w-4" /> Acceso seguro
              </div>
              <h2 className="mt-2 text-xl font-bold sm:text-2xl">Ingresá con tu cuenta institucional</h2>
              <p className="mt-2 max-w-xl text-sm text-white/85 sm:text-base">
                Las cuentas se crean desde el panel de administración. Si no tenés usuario, pedile a un administrador.
              </p>
            </div>
            <Link
              to="/auth"
              className="inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-primary shadow-elegant transition hover:bg-white/90 sm:w-auto"
            >
              Ir al login <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border px-4 py-8 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} Jefatura de Recaudaciones — {APP_VERSION_LABEL}</p>
        <Link to="/" className="mt-3 inline-block text-xs text-muted-foreground/80 hover:text-foreground">
          Portada contribuyentes
        </Link>
      </footer>
    </div>
  );
}
