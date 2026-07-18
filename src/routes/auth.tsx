import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Ingresar — SIGAT" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function goHome(userId: string) {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roles = (data ?? []).map((r) => r.role);
    if (roles.includes("host") && !roles.includes("admin") && !roles.includes("operator")) {
      navigate({ to: "/host" });
    } else {
      navigate({ to: "/operator" });
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void goHome(data.session.user.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Bienvenido");
    await goHome(data.user.id);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-hero p-6">
      <div className="w-full max-w-md">
        <Link to="/staff" className="mb-6 inline-flex items-center gap-2 text-sm text-white/80 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Volver a funcionarios
        </Link>
        <div className="rounded-3xl border border-white/10 bg-card p-8 shadow-elegant">
          <div className="flex items-center gap-3">
            <img src="/sigat-icon.png" alt="SIGAT" className="h-11 w-11 rounded-xl shadow-elegant" />
            <div>
              <h1 className="text-xl font-bold">Acceso funcionarios</h1>
              <p className="text-sm text-muted-foreground">SIGAT — Panel interno</p>
            </div>
          </div>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium">Correo</label>
              <input
                type="email" required autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Contraseña</label>
              <input
                type="password" required autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
            </div>
            <button
              disabled={loading}
              className="w-full rounded-lg bg-gradient-primary py-2.5 font-semibold text-primary-foreground shadow-elegant transition hover:brightness-105 disabled:opacity-50"
            >
              {loading ? "Ingresando..." : "Ingresar"}
            </button>
          </form>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Las cuentas se gestionan desde el panel de administración.
          </p>
        </div>
      </div>
    </div>
  );
}
