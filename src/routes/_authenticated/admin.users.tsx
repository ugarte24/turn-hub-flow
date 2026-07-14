import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listOperators, createOperator, setUserActive, deleteUser } from "@/lib/sigat.functions";
import { toast } from "sonner";
import { UserPlus, Trash2, ShieldCheck, ShieldOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "Usuarios — SIGAT" }] }),
  component: UsersPage,
});

type Op = { id: string; full_name: string; active: boolean; roles: string[] };

function UsersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listOperators);
  const createFn = useServerFn(createOperator);
  const activeFn = useServerFn(setUserActive);
  const delFn = useServerFn(deleteUser);
  const users = useQuery({ queryKey: ["users"], queryFn: () => listFn() });
  const [showForm, setShowForm] = useState(false);

  const create = useMutation({
    mutationFn: async (v: { email: string; password: string; fullName: string; role: "admin" | "operator" }) =>
      createFn({ data: v }),
    onSuccess: () => { toast.success("Usuario creado"); qc.invalidateQueries({ queryKey: ["users"] }); setShowForm(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (v: { userId: string; active: boolean }) => activeFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => delFn({ data: { userId: id } }),
    onSuccess: () => { toast.success("Eliminado"); qc.invalidateQueries({ queryKey: ["users"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 md:p-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold">Usuarios</h1>
          <p className="text-sm text-muted-foreground">Operadores y administradores del sistema</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-2 rounded-full bg-gradient-primary px-4 py-2 text-primary-foreground shadow-elegant">
          <UserPlus className="h-4 w-4" /> Nuevo usuario
        </button>
      </div>

      {showForm && <UserForm onSubmit={(v) => create.mutate(v)} loading={create.isPending} />}

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(users.data as Op[] | undefined ?? []).map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{u.full_name || "(sin nombre)"}</td>
                <td className="px-4 py-3">
                  {u.roles.map((r) => (
                    <span key={r} className="mr-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{r}</span>
                  ))}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                    {u.active ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => toggle.mutate({ userId: u.id, active: !u.active })} className="mr-2 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
                    {u.active ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    {u.active ? "Desactivar" : "Activar"}
                  </button>
                  <button onClick={() => confirm("¿Eliminar usuario?") && del.mutate(u.id)} className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-3.5 w-3.5" /> Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserForm({ onSubmit, loading }: { onSubmit: (v: { email: string; password: string; fullName: string; role: "admin" | "operator" }) => void; loading: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"admin" | "operator">("operator");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ email, password, fullName, role }); }} className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-5 md:grid-cols-2">
      <Field label="Nombre completo"><input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" /></Field>
      <Field label="Correo"><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" /></Field>
      <Field label="Contraseña"><input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="input" /></Field>
      <Field label="Rol">
        <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "operator")} className="input">
          <option value="operator">Operador</option>
          <option value="admin">Administrador</option>
        </select>
      </Field>
      <button disabled={loading} className="md:col-span-2 rounded-lg bg-gradient-primary py-2.5 font-semibold text-primary-foreground shadow-elegant hover:brightness-105 disabled:opacity-50">
        {loading ? "Creando..." : "Crear usuario"}
      </button>
      <style>{`.input { width:100%; border:1px solid var(--input); border-radius: 0.5rem; padding: 0.5rem 0.75rem; background: var(--background); outline: none; } .input:focus { border-color: var(--ring); box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 25%, transparent); }`}</style>
    </form>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm"><span className="font-medium">{label}</span><div className="mt-1">{children}</div></label>;
}
