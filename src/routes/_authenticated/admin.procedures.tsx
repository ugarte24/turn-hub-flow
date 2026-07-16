import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchAllAreas, fetchAllProcedures } from "@/lib/sigat-queries";
import { deleteArea, deleteProcedure, upsertArea, upsertProcedure } from "@/lib/sigat.functions";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Layers } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/procedures")({
  head: () => ({ meta: [{ title: "Áreas y trámites — SIGAT" }] }),
  component: Page,
});

type ProcEdit = { id?: string; areaId: string; name: string; active: boolean };
type AreaEdit = { id?: string; code: string; name: string; active: boolean };

function Page() {
  const qc = useQueryClient();
  const areas = useQuery({ queryKey: ["all_areas"], queryFn: fetchAllAreas });
  const procs = useQuery({ queryKey: ["all_procs"], queryFn: fetchAllProcedures });
  const upsertProcFn = useServerFn(upsertProcedure);
  const delProcFn = useServerFn(deleteProcedure);
  const upsertAreaFn = useServerFn(upsertArea);
  const delAreaFn = useServerFn(deleteArea);

  const [editingProc, setEditingProc] = useState<ProcEdit | null>(null);
  const [editingArea, setEditingArea] = useState<AreaEdit | null>(null);

  const upsertProc = useMutation({
    mutationFn: async (v: ProcEdit) => upsertProcFn({ data: v }),
    onSuccess: () => { toast.success("Trámite guardado"); qc.invalidateQueries(); setEditingProc(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delProc = useMutation({
    mutationFn: async (id: string) => delProcFn({ data: { id } }),
    onSuccess: () => { toast.success("Trámite eliminado"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const upsertAr = useMutation({
    mutationFn: async (v: AreaEdit) => upsertAreaFn({ data: v }),
    onSuccess: () => { toast.success("Área guardada"); qc.invalidateQueries(); setEditingArea(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delAr = useMutation({
    mutationFn: async (id: string) => delAreaFn({ data: { id } }),
    onSuccess: () => { toast.success("Área eliminada"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Áreas y trámites</h1>
          <p className="text-sm text-muted-foreground">Configura las áreas y los trámites disponibles</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditingArea({ code: "", name: "", active: true })}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-accent"
          >
            <Layers className="h-4 w-4" /> Nueva área
          </button>
          <button
            type="button"
            onClick={() => setEditingProc({ areaId: areas.data?.[0]?.id ?? "", name: "", active: true })}
            disabled={!areas.data?.length}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-primary px-4 py-2 text-primary-foreground shadow-elegant disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Nuevo trámite
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {(areas.data ?? []).map((a) => (
          <div key={a.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className={`text-lg font-bold ${a.active ? "" : "text-muted-foreground line-through"}`}>{a.name}</h3>
                <p className="text-xs text-muted-foreground">
                  Código ticket: <span className="font-ticket font-semibold text-foreground">{a.code}</span>
                  {!a.active && " · Inactiva"}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => setEditingArea({ id: a.id, code: a.code, name: a.name, active: a.active })}
                  className="rounded-md border border-border p-1 text-muted-foreground hover:bg-accent"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => confirm("¿Eliminar área y sus trámites?") && delAr.mutate(a.id)}
                  className="rounded-md border border-destructive/40 p-1 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <ul className="mt-3 divide-y divide-border">
              {(procs.data ?? []).filter((p) => p.area_id === a.id).length === 0 && (
                <li className="py-3 text-sm text-muted-foreground">Sin trámites. Agrega uno con “Nuevo trámite”.</li>
              )}
              {(procs.data ?? []).filter((p) => p.area_id === a.id).map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <span className={p.active ? "font-medium" : "text-muted-foreground line-through"}>{p.name}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingProc({ id: p.id, areaId: p.area_id, name: p.name, active: p.active })}
                      className="rounded-md border border-border p-1 text-muted-foreground hover:bg-accent"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => confirm("¿Eliminar?") && delProc.mutate(p.id)}
                      className="rounded-md border border-destructive/40 p-1 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {editingArea && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-elegant">
            <h2 className="text-xl font-bold">{editingArea.id ? "Editar área" : "Nueva área"}</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-sm font-medium">Nombre</label>
                <input
                  value={editingArea.name}
                  onChange={(e) => setEditingArea({ ...editingArea, name: e.target.value })}
                  placeholder="Ej. Cementerio"
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Código (prefijo del ticket)</label>
                <input
                  value={editingArea.code}
                  onChange={(e) => setEditingArea({
                    ...editingArea,
                    code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3),
                  })}
                  placeholder="Ej. C"
                  maxLength={3}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 font-ticket tracking-widest"
                />
                <p className="mt-1 text-xs text-muted-foreground">1 a 3 caracteres. Generará tickets como {editingArea.code || "X"}1.</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editingArea.active}
                  onChange={(e) => setEditingArea({ ...editingArea, active: e.target.checked })}
                />
                Activa (visible al sacar turno)
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingArea(null)} className="rounded-lg border border-border px-4 py-2 text-sm">Cancelar</button>
              <button
                type="button"
                onClick={() => upsertAr.mutate(editingArea)}
                disabled={upsertAr.isPending || !editingArea.name.trim() || !editingArea.code.trim()}
                className="rounded-lg bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-elegant disabled:opacity-50"
              >
                {upsertAr.isPending ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingProc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-elegant">
            <h2 className="text-xl font-bold">{editingProc.id ? "Editar trámite" : "Nuevo trámite"}</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-sm font-medium">Área</label>
                <select
                  value={editingProc.areaId}
                  onChange={(e) => setEditingProc({ ...editingProc, areaId: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"
                >
                  {(areas.data ?? []).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Nombre</label>
                <input
                  value={editingProc.name}
                  onChange={(e) => setEditingProc({ ...editingProc, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editingProc.active}
                  onChange={(e) => setEditingProc({ ...editingProc, active: e.target.checked })}
                />
                Activo
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingProc(null)} className="rounded-lg border border-border px-4 py-2 text-sm">Cancelar</button>
              <button
                type="button"
                onClick={() => upsertProc.mutate(editingProc)}
                disabled={upsertProc.isPending || !editingProc.name.trim() || !editingProc.areaId}
                className="rounded-lg bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-elegant disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
