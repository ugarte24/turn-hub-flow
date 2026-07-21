import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchAllAreas, fetchAllProcedures, fetchServicePoints, fetchServicePointProcedures } from "@/lib/sigat-queries";
import { deleteServicePoint, listOperators, upsertServicePoint } from "@/lib/sigat.functions";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/service-points")({
  head: () => ({ meta: [{ title: "Puestos — SIGAT" }] }),
  component: ServicePointsPage,
});

type SP = { id: string; name: string; active: boolean; operator_id: string | null };
type AreaOpt = { id: string; name: string; sort_order: number };
type ProcOpt = { id: string; area_id: string; name: string };

function ServicePointsPage() {
  const qc = useQueryClient();
  const sps = useQuery({ queryKey: ["service_points"], queryFn: fetchServicePoints });
  const areas = useQuery({ queryKey: ["all_areas"], queryFn: fetchAllAreas });
  const procs = useQuery({ queryKey: ["all_procs"], queryFn: fetchAllProcedures });
  const spp = useQuery({ queryKey: ["spp"], queryFn: fetchServicePointProcedures });
  const listFn = useServerFn(listOperators);
  const upsertFn = useServerFn(upsertServicePoint);
  const delFn = useServerFn(deleteServicePoint);
  const ops = useQuery({ queryKey: ["users"], queryFn: () => listFn() });

  const [editing, setEditing] = useState<SP | null>(null);

  const areaName = (areaId: string) =>
    (areas.data ?? []).find((a) => a.id === areaId)?.name ?? "Área";

  const upsert = useMutation({
    mutationFn: async (v: { id?: string; name: string; active: boolean; operatorId?: string | null; procedureIds: string[] }) =>
      upsertFn({ data: v }),
    onSuccess: () => { toast.success("Puesto guardado"); qc.invalidateQueries(); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Puesto eliminado"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const currentProcIds = (id?: string) =>
    (spp.data ?? []).filter((r) => r.service_point_id === id).map((r) => r.procedure_id);

  return (
    <div className="p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:p-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold md:text-3xl">Puestos de atención</h1>
          <p className="text-sm text-muted-foreground">Configura ventanillas, operadores y trámites asignados</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ id: "", name: "", active: true, operator_id: null } as SP)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant sm:w-auto"
        >
          <Plus className="h-4 w-4" /> Nuevo puesto
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:mt-6 md:grid-cols-2 md:gap-4">
        {(sps.data ?? []).map((sp) => {
          const pids = currentProcIds(sp.id);
          const operator = ((ops.data as { id: string; full_name: string }[] | undefined) ?? [])
            .find((o) => o.id === sp.operator_id);
          return (
            <div key={sp.id} className="rounded-2xl border border-border bg-card p-4 md:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base font-bold md:text-lg">{sp.name}</h3>
                  <p className="text-xs text-muted-foreground">{sp.active ? "Activo" : "Inactivo"}</p>
                  <p className="mt-1 text-sm">
                    <span className="text-muted-foreground">Operador: </span>
                    <span className="font-medium">
                      {operator?.full_name?.trim() || (sp.operator_id ? "Sin nombre" : "Sin asignar")}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => setEditing(sp)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">Editar</button>
                  <button type="button" onClick={() => confirm("¿Eliminar puesto?") && del.mutate(sp.id)} className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {(procs.data ?? []).filter((p) => pids.includes(p.id)).map((p) => (
                  <span key={p.id} className="rounded-full bg-accent px-2 py-0.5 text-xs">
                    <span className="font-semibold">{areaName(p.area_id)}</span>
                    <span className="text-muted-foreground"> · </span>
                    {p.name}
                  </span>
                ))}
                {pids.length === 0 && <span className="text-xs text-muted-foreground">Sin trámites asignados</span>}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <SPForm
          initial={editing}
          initialProcIds={currentProcIds(editing.id || undefined)}
          areas={areas.data ?? []}
          procs={procs.data ?? []}
          operators={(ops.data as { id: string; full_name: string }[] | undefined) ?? []}
          onCancel={() => setEditing(null)}
          onSave={(v) => upsert.mutate({ ...v, id: editing.id || undefined })}
          loading={upsert.isPending}
        />
      )}
    </div>
  );
}

function SPForm({
  initial, initialProcIds, areas, procs, operators, onCancel, onSave, loading,
}: {
  initial: SP; initialProcIds: string[];
  areas: AreaOpt[];
  procs: ProcOpt[];
  operators: { id: string; full_name: string }[];
  onCancel: () => void;
  onSave: (v: { name: string; active: boolean; operatorId: string | null; procedureIds: string[] }) => void;
  loading: boolean;
}) {
  const [name, setName] = useState(initial.name);
  const [active, setActive] = useState(initial.active);
  const [operatorId, setOperatorId] = useState<string | null>(initial.operator_id);
  const [pids, setPids] = useState<string[]>(initialProcIds);

  const sortedAreas = [...areas].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl bg-card shadow-elegant sm:rounded-2xl">
        <div className="overflow-y-auto p-5 md:p-6">
        <h2 className="text-xl font-bold">{initial.id ? "Editar puesto" : "Nuevo puesto"}</h2>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium">Nombre</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2.5 outline-none focus:border-ring" />
          </div>
          <div>
            <label className="text-sm font-medium">Operador asignado (opcional)</label>
            <select value={operatorId ?? ""} onChange={(e) => setOperatorId(e.target.value || null)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2.5">
              <option value="">— Ninguno —</option>
              {operators.map((o) => <option key={o.id} value={o.id}>{o.full_name || o.id.slice(0, 8)}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Activo
          </label>
          <div>
            <label className="text-sm font-medium">Trámites atendidos</label>
            <div className="mt-2 max-h-48 space-y-3 overflow-auto rounded-lg border border-border p-2 sm:max-h-60">
              {sortedAreas.map((area) => {
                const areaProcs = procs.filter((p) => p.area_id === area.id);
                if (areaProcs.length === 0) return null;
                return (
                  <div key={area.id}>
                    <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {area.name}
                    </p>
                    <div className="space-y-1">
                      {areaProcs.map((p) => (
                        <label key={p.id} className="flex min-h-10 items-center gap-2 rounded px-2 py-1.5 hover:bg-accent">
                          <input
                            type="checkbox"
                            checked={pids.includes(p.id)}
                            onChange={(e) =>
                              setPids((prev) =>
                                e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id),
                              )
                            }
                          />
                          <span className="text-sm">{p.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        </div>
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="rounded-lg border border-border px-4 py-2.5 text-sm">Cancelar</button>
          <button type="button" onClick={() => onSave({ name, active, operatorId, procedureIds: pids })} disabled={loading || !name.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant disabled:opacity-50">
            <Save className="h-4 w-4" /> {loading ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
