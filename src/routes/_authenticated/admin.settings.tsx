import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Info, Upload, Film } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({ meta: [{ title: "Configuración — SIGAT" }] }),
  component: SettingsPage,
});

type Row = { key: string; value: Record<string, unknown> };
export type VideoSource = "none" | "file" | "youtube" | "url" | "iframe";

const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB

function SettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [hoursStart, setHoursStart] = useState("08:30");
  const [hoursEnd, setHoursEnd] = useState("16:30");
  const [institution, setInstitution] = useState("Jefatura de Recaudaciones");
  const [subtitle, setSubtitle] = useState("Sistema Integral de Gestión de Atención por Turnos");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [videoSource, setVideoSource] = useState<VideoSource>("file");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoFileName, setVideoFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    supabase.from("settings").select("*").then(({ data }) => {
      const r = (data ?? []) as Row[];
      const hours = r.find((x) => x.key === "working_hours")?.value as { start?: string; end?: string } | undefined;
      const tv = r.find((x) => x.key === "tv_display")?.value as {
        institution?: string;
        subtitle?: string;
        videoEnabled?: boolean;
        videoSource?: VideoSource;
        videoUrl?: string;
        videoFileName?: string;
      } | undefined;
      const sound = r.find((x) => x.key === "sound")?.value as { enabled?: boolean; voice?: boolean } | undefined;
      if (hours?.start) setHoursStart(hours.start);
      if (hours?.end) setHoursEnd(hours.end);
      if (tv?.institution) setInstitution(tv.institution);
      if (tv?.subtitle) setSubtitle(tv.subtitle);
      if (typeof tv?.videoEnabled === "boolean") setVideoEnabled(tv.videoEnabled);
      if (tv?.videoSource) setVideoSource(tv.videoSource === "none" ? "file" : tv.videoSource);
      if (tv?.videoUrl) setVideoUrl(tv.videoUrl);
      if (tv?.videoFileName) setVideoFileName(tv.videoFileName);
      if (typeof sound?.enabled === "boolean") setSoundEnabled(sound.enabled);
      if (typeof sound?.voice === "boolean") setVoiceEnabled(sound.voice);
    });
  }, []);

  async function uploadVideo(file: File) {
    if (!file.type.startsWith("video/")) {
      toast.error("Selecciona un archivo de video (MP4, WebM, etc.)");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error("El video no debe superar 100 MB");
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
    const path = `tv/loop-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("tv-media").upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type,
    });
    if (error) {
      setUploading(false);
      toast.error(error.message);
      return;
    }

    const { data } = supabase.storage.from("tv-media").getPublicUrl(path);
    setVideoUrl(data.publicUrl);
    setVideoFileName(file.name);
    setVideoSource("file");
    setVideoEnabled(true);
    setUploading(false);
    toast.success("Video subido. Guarda la configuración para aplicarlo en la TV.");
  }

  async function save() {
    setLoading(true);
    const updates = [
      { key: "working_hours", value: { start: hoursStart, end: hoursEnd } },
      {
        key: "tv_display",
        value: {
          institution,
          subtitle,
          videoEnabled,
          videoSource: videoEnabled ? videoSource : "none",
          videoUrl: videoUrl.trim(),
          videoFileName: videoFileName || null,
        },
      },
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
      <p className="text-sm text-muted-foreground">Horarios, pantalla, video y sonidos</p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card title="Horario de atención">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Inicio"><input type="time" value={hoursStart} onChange={(e) => setHoursStart(e.target.value)} className="input" /></Field>
            <Field label="Fin"><input type="time" value={hoursEnd} onChange={(e) => setHoursEnd(e.target.value)} className="input" /></Field>
          </div>
        </Card>
        <Card title="Pantalla TV — textos">
          <Field label="Institución"><input value={institution} onChange={(e) => setInstitution(e.target.value)} className="input" /></Field>
          <Field label="Subtítulo"><input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className="input" /></Field>
        </Card>

        <Card title="Pantalla TV — video">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={videoEnabled} onChange={(e) => setVideoEnabled(e.target.checked)} />
            Mostrar video en la pantalla
          </label>
          {videoEnabled && (
            <>
              <Field label="Tipo de fuente">
                <select
                  value={videoSource}
                  onChange={(e) => setVideoSource(e.target.value as VideoSource)}
                  className="input"
                >
                  <option value="file">Archivo de la computadora (recomendado)</option>
                  <option value="youtube">YouTube</option>
                  <option value="url">URL directa de video</option>
                  <option value="iframe">Página web embebida</option>
                </select>
              </Field>

              {videoSource === "file" && (
                <div className="space-y-3">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.webm,.mov"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadVideo(f);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background px-4 py-6 text-sm font-semibold hover:border-primary/50 hover:bg-accent disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" />
                    {uploading ? "Subiendo video…" : "Elegir video de la computadora"}
                  </button>
                  {videoUrl ? (
                    <div className="flex items-start gap-3 rounded-xl border border-border bg-accent/40 p-3">
                      <Film className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0 text-xs">
                        <p className="truncate font-semibold">{videoFileName || "Video cargado"}</p>
                        <p className="mt-1 break-all text-muted-foreground">{videoUrl}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Aún no hay video cargado.</p>
                  )}
                  <p className="flex items-start gap-2 rounded-lg bg-accent/50 p-3 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Formatos: MP4 / WebM (máx. 100 MB). Se guarda en la nube y se reproduce en bucle sin sonido en la TV.
                  </p>
                </div>
              )}

              {videoSource !== "file" && (
                <>
                  <Field label={videoSource === "youtube" ? "URL de YouTube" : videoSource === "url" ? "URL del video" : "URL de la página"}>
                    <input
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder={
                        videoSource === "youtube"
                          ? "https://www.youtube.com/watch?v=... o https://youtu.be/..."
                          : videoSource === "url"
                            ? "https://ejemplo.com/video.mp4"
                            : "https://ejemplo.com/pagina"
                      }
                      className="input"
                    />
                  </Field>
                  <p className="flex items-start gap-2 rounded-lg bg-accent/50 p-3 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {videoSource === "youtube" && "Se reproduce en bucle, sin sonido, para no interferir con el llamado de turnos."}
                    {videoSource === "url" && "Enlace directo a un archivo .mp4 o .webm público."}
                    {videoSource === "iframe" && "La página debe permitir embeberse (sin X-Frame-Options que lo bloquee)."}
                  </p>
                </>
              )}
            </>
          )}
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

      <button onClick={save} disabled={loading || uploading} className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-primary px-6 py-2.5 font-semibold text-primary-foreground shadow-elegant disabled:opacity-50">
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
