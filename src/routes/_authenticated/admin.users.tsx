import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listOperators, createOperator, updateOperator, setUserActive, deleteUser } from "@/lib/sigat.functions";
import { toast } from "sonner";
import { UserPlus, Trash2, ShieldCheck, ShieldOff, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "Usuarios — SIGAT" }] }),
  component: UsersPage,
});

type AppRole = "admin" | "operator" | "host";
type Op = { id: string; full_name: string; active: boolean; roles: string[] };

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  operator: "Operador",
  host: "Personal de apoyo",
};

function primaryRole(roles: string[]): AppRole {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("host")) return "host";
  return "operator";
}

function UsersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listOperators);
  const createFn = useServerFn(createOperator);
  const updateFn = useServerFn(updateOperator);
  const activeFn = useServerFn(setUserActive);
  const delFn = useServerFn(deleteUser);
  const users = useQuery({ queryKey: ["users"], queryFn: () => listFn() });
  const [mode, setMode] = useState<"closed" | "create" | "edit">("closed");
  const [editing, setEditing] = useState<Op | null>(null);
  const [formKey, setFormKey] = useState(0);

  const create = useMutation({
    mutationFn: async (v: { email: string; password: string; fullName: string; role: AppRole }) =>
      createFn({ data: v }),
    onSuccess: () => {
      toast.success("Usuario creado");
      qc.invalidateQueries({ queryKey: ["users"] });
      setMode("closed");
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (v: { userId: string; fullName: string; role: AppRole; password?: string }) =>
      updateFn({ data: v }),
    onSuccess: () => {
      toast.success("Usuario actualizado");
      qc.invalidateQueries({ queryKey: ["users"] });
      setMode("closed");
      setEditing(null);
    },
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

  function openCreate() {
    setEditing(null);
    setFormKey((k) => k + 1);
    setMode("create");
  }

  function openEdit(u: Op) {
    setEditing(u);
    setFormKey((k) => k + 1);
    setMode("edit");
  }

  function closeForm() {
    setMode("closed");
    setEditing(null);
  }

  const list = (users.data as Op[] | undefined) ?? [];

  return (
    <div className="p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:p-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold md:text-3xl">Usuarios</h1>
          <p className="text-sm text-muted-foreground">Operadores y administradores del sistema</p>
        </div>
        <button
          type="button"
          onClick={() => (mode !== "closed" ? closeForm() : openCreate())}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant sm:w-auto"
        >
          <UserPlus className="h-4 w-4" /> {mode !== "closed" ? "Cerrar" : "Nuevo usuario"}
        </button>
      </div>

      {mode === "create" && (
        <UserForm
          key={formKey}
          mode="create"
          loading={create.isPending}
          onSubmit={(v) => create.mutate({
            email: v.email!,
            password: v.password!,
            fullName: v.fullName,
            role: v.role,
          })}
          onCancel={closeForm}
        />
      )}
      {mode === "edit" && editing && (
        <UserForm
          key={formKey}
          mode="edit"
          loading={update.isPending}
          initial={{ fullName: editing.full_name, role: primaryRole(editing.roles) }}
          onSubmit={(v) => update.mutate({
            userId: editing.id,
            fullName: v.fullName,
            role: v.role,
            password: v.password || undefined,
          })}
          onCancel={closeForm}
        />
      )}

      {/* Móvil: tarjetas */}
      <div className="mt-5 space-y-3 md:hidden">
        {list.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No hay usuarios
          </p>
        ) : (
          list.map((u) => (
            <div key={u.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">{u.full_name || "(sin nombre)"}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${u.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                  {u.active ? "Activo" : "Inactivo"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {u.roles.map((r) => (
                  <span key={r} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{ROLE_LABELS[r] ?? r}</span>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(u)}
                  className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-border px-2 text-xs font-medium hover:bg-accent"
                >
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                <button
                  type="button"
                  onClick={() => toggle.mutate({ userId: u.id, active: !u.active })}
                  className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-border px-2 text-xs font-medium hover:bg-accent"
                >
                  {u.active ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  {u.active ? "Desact." : "Activar"}
                </button>
                <button
                  type="button"
                  onClick={() => confirm("¿Eliminar usuario?") && del.mutate(u.id)}
                  className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-destructive/40 px-2 text-xs font-medium text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop: tabla */}
      <div className="mt-6 hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
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
            {list.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{u.full_name || "(sin nombre)"}</td>
                <td className="px-4 py-3">
                  {u.roles.map((r) => (
                    <span key={r} className="mr-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{ROLE_LABELS[r] ?? r}</span>
                  ))}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                    {u.active ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => openEdit(u)}
                    className="mr-2 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle.mutate({ userId: u.id, active: !u.active })}
                    className="mr-2 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                  >
                    {u.active ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    {u.active ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => confirm("¿Eliminar usuario?") && del.mutate(u.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                  >
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

function UserForm({
  mode,
  initial,
  onSubmit,
  onCancel,
  loading,
}: {
  mode: "create" | "edit";
  initial?: { fullName: string; role: AppRole };
  onSubmit: (v: { email?: string; password?: string; fullName: string; role: AppRole }) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [role, setRole] = useState<AppRole>(initial?.role ?? "operator");
  const unlock = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.readOnly = false;
  };

  return (
    <form
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        if (mode === "create") {
          onSubmit({ email, password, fullName, role });
        } else {
          onSubmit({ fullName, role, password: password || undefined });
        }
      }}
      className="mt-5 grid gap-3 rounded-2xl border border-border bg-card p-4 md:mt-6 md:grid-cols-2 md:p-5"
    >
      <p className="md:col-span-2 text-sm font-semibold text-foreground">
        {mode === "create" ? "Nuevo usuario" : "Editar usuario"}
      </p>

      <input type="text" name="username" autoComplete="username" tabIndex={-1} aria-hidden className="pointer-events-none absolute h-0 w-0 opacity-0" defaultValue="" readOnly />
      <input type="password" name="password" autoComplete="current-password" tabIndex={-1} aria-hidden className="pointer-events-none absolute h-0 w-0 opacity-0" defaultValue="" readOnly />

      <Field label="Nombre completo">
        <input
          required
          name="user-fullname"
          autoComplete="off"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="input"
        />
      </Field>

      {mode === "create" ? (
        <Field label="Correo">
          <input
            required
            type="email"
            name="user-email"
            autoComplete="off"
            readOnly
            onFocus={unlock}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </Field>
      ) : (
        <Field label="Rol">
          <select value={role} onChange={(e) => setRole(e.target.value as AppRole)} className="input" autoComplete="off">
            <option value="operator">Operador</option>
            <option value="host">Personal de apoyo</option>
            <option value="admin">Administrador</option>
          </select>
        </Field>
      )}

      <Field label={mode === "create" ? "Contraseña" : "Nueva contraseña (opcional)"}>
        <input
          required={mode === "create"}
          type="password"
          name="user-password"
          autoComplete="new-password"
          minLength={mode === "create" ? 6 : undefined}
          readOnly
          onFocus={unlock}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === "edit" ? "Dejar vacío para no cambiar" : undefined}
          className="input"
        />
      </Field>

      {mode === "create" ? (
        <Field label="Rol">
          <select value={role} onChange={(e) => setRole(e.target.value as AppRole)} className="input" autoComplete="off">
            <option value="operator">Operador</option>
            <option value="host">Personal de apoyo</option>
            <option value="admin">Administrador</option>
          </select>
        </Field>
      ) : (
        <div className="hidden md:block" />
      )}

      <div className="md:col-span-2 flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-lg bg-gradient-primary py-2.5 font-semibold text-primary-foreground shadow-elegant hover:brightness-105 disabled:opacity-50"
        >
          {loading ? "Guardando..." : mode === "create" ? "Crear usuario" : "Guardar cambios"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2.5 font-medium hover:bg-accent"
        >
          Cancelar
        </button>
      </div>
      <style>{`.input { width:100%; border:1px solid var(--input); border-radius: 0.5rem; padding: 0.5rem 0.75rem; background: var(--background); outline: none; } .input:focus { border-color: var(--ring); box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 25%, transparent); }`}</style>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm"><span className="font-medium">{label}</span><div className="mt-1">{children}</div></label>;
}
