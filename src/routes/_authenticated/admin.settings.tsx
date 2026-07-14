import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Info } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({ meta: [{ title: "Configuración — SIGAT" }] }),
  component: SettingsPage,
});

type Row = { key: string; value: Record<string, unknown> };

function SettingsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [hoursStart, setHoursStart] = useState("08:30");
  const [hoursEnd, setHoursEnd] = useState("16:30");
  const [institution, setInstitution] = useState("Jefatura de Recaudaciones");
  const [subtitle, setSubtitle] = useState("Sistema Integral de Gestión de Atención por Turnos");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("settings").select("*").then(({ data }) => {
      const r = (data ?? []) as Row[];
      setRows(r);
      const hours = r.find((x) => x.key === "working_hours")?.value as { start?: string; end?: string } | undefined;
      const tv = r.find((x) => x.key === "tv_display")?.value as { institution?: string; subtitle?: string } | undefined;
      const sound = r.find((x) => x.key === "sound")?.value as { enabled?: boolean; voice?: boolean } | undefined;
      if (hours?.start) setHoursStart(hours.start);
      if (hours?.end) setHoursEnd(hours.end);
      if (tv?.institution) setInstitution(tv.institution);
      if (tv?.subtitle) setSubtitle(tv.subtitle);
      if (typeof sound?.enabled === "boolean") setSoundEnabled(sound.enabled);
      if (typeof sound?.voice === "boolean") setVoiceEnabled(sound.voice);
    });
  }, []);

  async function save() {
    setLoading(true);
    const updates = [
      { key: "working_hours", value: { start: hoursStart, end: hoursEnd } },
      { key: "tv_display", value: { institution, subtitle } },
      { key: "sound", value: { enabled: soundEnabled, voice: voiceEnabled } },
    ];
    const { error } = await supabase.from("settings").upsert(updates);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Configuración guardada");
  }

  return (
    <div className="p-6 md:p-10">
      <h1 className="text-3xl font-extrabold">Configuración</h1>
      <p className="text-sm text-muted-foreground">Horarios, pantalla y sonidos</p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card title="Horario de atención">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Inicio"><input type="time" value={hoursStart} onChange={(e) => setHoursStart(e.target.value)} className="input" /></Field>
            <Field label="Fin"><input type="time" value={hoursEnd} onChange={(e) => setHoursEnd(e.target.value)} className="input" /></Field>
          </div>
        </Card>
        <Card title="Pantalla TV">
          <Field label="Institución"><input value={institution} onChange={(e) => setInstitution(e.target.value)} className="input" /></Field>
          <Field label="Subtítulo"><input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className="input" /></Field>
        </Card>
        <Card title="Sonido y voz">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} /> Activar sonido
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={voiceEnabled} onChange={(e) => setVoiceEnabled(e.target.checked)} /> Anunciar por voz
          </label>
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-accent/50 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5" />
            La voz automática usa la síntesis de voz del navegador en la pantalla TV.
          </p>
        </Card>
      </div>

      <button onClick={save} disabled={loading} className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-primary px-6 py-2.5 font-semibold text-primary-foreground shadow-elegant disabled:opacity-50">
        <Save className="h-4 w-4" /> {loading ? "Guardando..." : "Guardar cambios"}
      </button>

      <style>{`.input { width:100%; border:1px solid var(--input); border-radius: 0.5rem; padding: 0.5rem 0.75rem; background: var(--background); outline: none; margin-top: 0.25rem; }`}</style>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{title}</h3>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm"><span className="font-medium">{label}</span>{children}</label>;
}
