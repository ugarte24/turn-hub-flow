/**
 * Resolves Supabase env for browser (Vite) and server (Nitro/CF).
 * Lovable/producción: configurar las mismas claves en el panel de env del hosting.
 */
export function getSupabaseUrl(): string {
  const url =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "";
  return String(url).trim();
}

export function getSupabasePublishableKey(): string {
  const key =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    "";
  return String(key).trim();
}

export function getSupabaseServiceRoleKey(): string {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

export function requireSupabaseUrlAndAnon(): { url: string; key: string } {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();
  if (!url || !key) {
    const missing = [
      ...(!url ? ["VITE_SUPABASE_URL / SUPABASE_URL"] : []),
      ...(!key ? ["VITE_SUPABASE_PUBLISHABLE_KEY / SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    throw new Error(
      `Faltan variables de Supabase en el entorno: ${missing.join(", ")}. ` +
        `Configúralas en Lovable (Project Settings → Environment) y vuelve a publicar.`,
    );
  }
  return { url, key };
}
