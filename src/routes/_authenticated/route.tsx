import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, LayoutDashboard, Users, Building2, ListChecks, Radio, Settings2, Menu, TicketPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { APP_VERSION_LABEL } from "@/lib/version";
import { isLegacyBrowser } from "@/lib/browser-compat";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // getSession es local/rápido; getUser siempre va a la red y en PCs viejas se siente lento.
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) throw redirect({ to: "/auth" });
    // Los roles se cargan antes de renderizar para que el menú nazca
    // completo y no cambie de tamaño.
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    return { user, roles: (roleRows ?? []).map((r) => r.role) };
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { user, roles } = Route.useRouteContext();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const [legacy, setLegacy] = useState(false);
  const [legacyDismissed, setLegacyDismissed] = useState(false);
  const isAdmin = roles.includes("admin");
  const isHost = roles.includes("host");
  const isOperator = roles.includes("operator");

  useEffect(() => {
    setLegacy(isLegacyBrowser());
  }, []);

  async function signOut() {
    setMenuOpen(false);
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const nav = [
    ...(isOperator || isAdmin || roles.length === 0 ? [{ to: "/operator", label: "Mi puesto", icon: Radio }] : []),
    ...(isHost || isAdmin ? [{ to: "/host", label: "Sacar turnos", icon: TicketPlus }] : []),
    ...(isAdmin
      ? [
          { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
          { to: "/admin/users", label: "Usuarios", icon: Users },
          { to: "/admin/service-points", label: "Puestos", icon: Building2 },
          { to: "/admin/procedures", label: "Áreas y trámites", icon: ListChecks },
          { to: "/admin/settings", label: "Configuración", icon: Settings2 },
        ]
      : []),
  ] as const;

  function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <nav className="flex-1 space-y-1 px-3">
        {nav.map((item) => {
          // /admin solo exacto; el resto respeta subrutas sin marcar a hermanos
          const active =
            item.to === "/admin"
              ? pathname === "/admin" || pathname === "/admin/"
              : pathname === item.to || pathname.startsWith(`${item.to}/`);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "hover:bg-sidebar-accent"
              }`}
            >
              <item.icon className="h-4 w-4" /> {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="flex h-screen h-dvh overflow-hidden bg-background">
      <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto bg-sidebar text-sidebar-foreground md:flex">
        <div className="px-6 py-6">
          <div className="flex items-center gap-3">
            <img src="/sigat-icon.png" alt="SIGAT" className="h-11 w-11 rounded-xl shadow-elegant" />
            <div>
              <p className="text-xs uppercase tracking-widest text-sidebar-foreground/60">Jefatura</p>
              <h1 className="text-2xl font-extrabold text-primary-glow">SIGAT</h1>
              <p className="text-xs text-sidebar-foreground/50">{APP_VERSION_LABEL}</p>
            </div>
          </div>
        </div>
        <NavLinks />
        <div className="border-t border-sidebar-border p-4">
          <p className="truncate text-xs text-sidebar-foreground/70">{user.email}</p>
          <button onClick={signOut} className="mt-2 inline-flex items-center gap-2 text-sm text-sidebar-foreground/90 hover:text-white">
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-foreground hover:bg-accent"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <span className="inline-flex items-center gap-2 font-bold text-primary">
              <img src="/sigat-icon.png" alt="" className="h-7 w-7 rounded-md" />
              SIGAT
            </span>
          </div>
          <button onClick={signOut} className="text-sm text-muted-foreground">Salir</button>
        </header>

        {menuOpen && (
          <div className="border-b border-border bg-sidebar text-sidebar-foreground md:hidden">
            <div className="flex max-h-[70vh] flex-col overflow-y-auto py-3">
              <NavLinks onNavigate={() => setMenuOpen(false)} />
              <div className="border-t border-sidebar-border p-4">
                <p className="truncate text-xs text-sidebar-foreground/70">{user.email}</p>
                <button
                  onClick={signOut}
                  className="mt-2 inline-flex items-center gap-2 text-sm text-sidebar-foreground/90 hover:text-white"
                >
                  <LogOut className="h-4 w-4" /> Cerrar sesión
                </button>
              </div>
            </div>
          </div>
        )}

        {legacy && !legacyDismissed && (
          <div className="shrink-0 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <div className="mx-auto flex max-w-5xl items-start justify-between gap-3">
              <div>
                <p className="font-semibold">Este equipo usa un navegador de Windows 7</p>
                <p className="mt-1 leading-relaxed">
                  El panel de SIGAT (llamar turnos, admin, configuración) está pensado para{" "}
                  <strong>Windows 10/11 con Chrome o Edge actualizado</strong>. En Win7 puede trabarse, ir lento o
                  no responder. Para operar el sistema usá otra PC moderna.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLegacyDismissed(true)}
                className="shrink-0 rounded-md border border-amber-400/60 px-2 py-1 text-xs font-semibold hover:bg-amber-100"
              >
                Entendido
              </button>
            </div>
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
