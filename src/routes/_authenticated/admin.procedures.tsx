import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchAllAreas, fetchAllProcedures } from "@/lib/sigat-queries";
import { deleteProcedure, upsertProcedure } from "@/lib/sigat.functions";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/procedures")({
  head: () => ({ meta: [{ title: "Áreas y trámites — SIGAT" }] }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const areas = useQuery({ queryKey: ["all_areas"], queryFn: fetchAllAreas });
  const procs = useQuery({ queryKey: ["all_procs"], queryFn: fetchAllProcedures });
  const upsertFn = useServerFn(upsertProcedure);
  const delFn = useServerFn(deleteProcedure);
  const [editing, setEditing] = useState<{ id?: string; areaId: string; name: string; active: boolean } | null>(null);

  const upsert = useMutation({
    mutationFn: async (v: { id?: string; areaId: string; name: string; active: boolean }) => upsertFn({ data: v }),
    onSuccess: () => { toast.success("Guardado"); qc.invalidateQueries(); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 md:p-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold">Áreas y trámites</h1>
          <p className="text-sm text-muted-foreground">Configura los trámites disponibles por área</p>
        </div>
        <button
          onClick={() => setEditing({ areaId: areas.data?.[0]?.id ?? "", name: "", active: true })}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-primary px-4 py-2 text-primary-foreground shadow-elegant"
        >
          <Plus className="h-4 w-4" /> Nuevo trámite
        </button>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {(areas.data ?? []).map((a) => (
          <div key={a.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-black text-primary">{a.code}</span>
              <h3 className="text-lg font-bold">{a.name}</h3>
            </div>
            <ul className="mt-3 divide-y divide-border">
              {(procs.data ?? []).filter((p) => p.area_id === a.id).map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <span className={p.active ? "font-medium" : "text-muted-foreground line-through"}>{p.name}</span>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing({ id: p.id, areaId: p.area_id, name: p.name, active: p.active })}
                      className="rounded-md border border-border p-1 text-muted-foreground hover:bg-accent">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => confirm("¿Eliminar?") && del.mutate(p.id)}
                      className="rounded-md border border-destructive/40 p-1 text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-elegant">
            <h2 className="text-xl font-bold">{editing.id ? "Editar trámite" : "Nuevo trámite"}</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-sm font-medium">Área</label>
                <select value={editing.areaId} onChange={(e) => setEditing({ ...editing, areaId: e.target.value })} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2">
                  {(areas.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Nombre</label>
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Activo
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg border border-border px-4 py-2 text-sm">Cancelar</button>
              <button onClick={() => upsert.mutate(editing)} disabled={upsert.isPending || !editing.name.trim()}
                className="rounded-lg bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-elegant disabled:opacity-50">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
