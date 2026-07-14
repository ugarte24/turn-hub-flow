import { createFileRoute, Link } from "@tanstack/react-router";
import { Ticket, Monitor, ShieldCheck, Users2, ArrowRight, QrCode } from "lucide-react";
import { APP_VERSION_LABEL } from "@/lib/version";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* HERO */}
      <header className="relative overflow-hidden bg-gradient-hero text-white">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_20%,white_1px,transparent_1px),radial-gradient(circle_at_80%_60%,white_1px,transparent_1px)] [background-size:32px_32px,48px_48px]" />
        <div className="relative mx-auto max-w-6xl px-6 py-16 md:py-24">
          <div className="flex items-center gap-3 text-sm font-medium uppercase tracking-widest text-white/80">
            <img src="/sigat-icon.png" alt="SIGAT" className="h-10 w-10 rounded-xl shadow-elegant" />
            Jefatura de Recaudaciones
          </div>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight md:text-6xl">
            SIGAT
            <span className="block text-primary-glow">Gestión de Atención por Turnos</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/85">
            Organiza la atención de contribuyentes por trámite y puesto. Sin filas,
            sin confusión: cada turno al funcionario que corresponde.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/ticket"
              className="inline-flex items-center gap-2 rounded-full bg-primary-glow px-6 py-3 font-semibold text-primary shadow-elegant transition hover:brightness-105"
            >
              <QrCode className="h-5 w-5" /> Sacar turno
            </Link>
            <Link
              to="/display"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-6 py-3 font-semibold text-white backdrop-blur transition hover:bg-white/20"
            >
              <Monitor className="h-5 w-5" /> Pantalla TV
            </Link>
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 font-semibold text-white/90 transition hover:bg-white/10"
            >
              Ingresar <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: Ticket, title: "Tickets por QR", desc: "El contribuyente escanea el QR, ingresa su CI y elige el trámite." },
            { icon: Users2, title: "Puestos dinámicos", desc: "Cada trámite se dirige automáticamente al puesto correspondiente." },
            { icon: Monitor, title: "Pantalla en vivo", desc: "Los llamados se muestran con sonido y voz automática." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-elegant">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="rounded-3xl border border-border bg-gradient-primary p-8 text-white shadow-elegant md:p-12">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-sm uppercase tracking-widest text-white/70">
                <ShieldCheck className="h-4 w-4" /> Panel institucional
              </div>
              <h2 className="mt-2 text-2xl font-bold md:text-3xl">Acceso para funcionarios</h2>
              <p className="mt-2 max-w-xl text-white/85">
                Operadores y administradores acceden a su panel para llamar turnos, configurar puestos y ver reportes en tiempo real.
              </p>
            </div>
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-primary shadow-elegant transition hover:bg-white/90"
            >
              Iniciar sesión <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Jefatura de Recaudaciones — {APP_VERSION_LABEL}
      </footer>
    </div>
  );
}
