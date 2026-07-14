import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, LayoutDashboard, Users, Building2, ListChecks, Radio, Settings2, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { APP_VERSION_LABEL } from "@/lib/version";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => {
      setIsAdmin((data ?? []).some((r) => r.role === "admin"));
    });
  }, [user.id]);

  async function signOut() {
    setMenuOpen(false);
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const nav = [
    { to: "/operator", label: "Mi puesto", icon: Radio },
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
          const active = pathname === item.to || (item.to !== "/operator" && pathname.startsWith(item.to));
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
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="px-6 py-6">
          <p className="text-xs uppercase tracking-widest text-sidebar-foreground/60">Jefatura</p>
          <h1 className="text-2xl font-extrabold text-primary-glow">SIGAT</h1>
          <p className="mt-1 text-xs text-sidebar-foreground/50">{APP_VERSION_LABEL}</p>
        </div>
        <NavLinks />
        <div className="border-t border-sidebar-border p-4">
          <p className="truncate text-xs text-sidebar-foreground/70">{user.email}</p>
          <button onClick={signOut} className="mt-2 inline-flex items-center gap-2 text-sm text-sidebar-foreground/90 hover:text-white">
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Abrir menú"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-foreground hover:bg-accent"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="flex w-[min(100%,20rem)] flex-col bg-sidebar p-0 text-sidebar-foreground">
                <SheetHeader className="border-b border-sidebar-border px-6 py-5 text-left">
                  <SheetTitle className="text-2xl font-extrabold text-primary-glow">SIGAT</SheetTitle>
                  <p className="text-xs text-sidebar-foreground/50">{APP_VERSION_LABEL}</p>
                </SheetHeader>
                <div className="flex flex-1 flex-col py-3">
                  <NavLinks onNavigate={() => setMenuOpen(false)} />
                </div>
                <div className="border-t border-sidebar-border p-4">
                  <p className="truncate text-xs text-sidebar-foreground/70">{user.email}</p>
                  <button
                    onClick={signOut}
                    className="mt-2 inline-flex items-center gap-2 text-sm text-sidebar-foreground/90 hover:text-white"
                  >
                    <LogOut className="h-4 w-4" /> Cerrar sesión
                  </button>
                </div>
              </SheetContent>
            </Sheet>
            <span className="font-bold text-primary">SIGAT</span>
          </div>
          <button onClick={signOut} className="text-sm text-muted-foreground">Salir</button>
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
