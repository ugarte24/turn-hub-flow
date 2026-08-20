/** Detecta navegadores viejos (p. ej. Chrome de Windows 7). */
export function isLegacyBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/MSIE |Trident\//i.test(ua)) return true;
  const chrome = ua.match(/Chrom(?:e|ium)\/(\d+)/i);
  if (chrome && Number(chrome[1]) > 0 && Number(chrome[1]) < 110) return true;
  const firefox = ua.match(/Firefox\/(\d+)/i);
  if (firefox && Number(firefox[1]) > 0 && Number(firefox[1]) < 115) return true;
  return false;
}

/** Celular / tablet: siempre app moderna. */
export function isMobileUserAgent(ua = typeof navigator !== "undefined" ? navigator.userAgent : ""): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
}

/** Win7 / navegador viejo en escritorio → panel /legacy/index.html. Móvil → app actual. */
export function shouldUseLegacyPanel(): boolean {
  if (typeof navigator === "undefined") return false;
  return isLegacyBrowser() && !isMobileUserAgent(navigator.userAgent);
}

export function authErrorMessage(error: { message?: string } | null | undefined): string {
  const msg = (error?.message ?? "").toLowerCase();
  if (!msg) return "No se pudo iniciar sesión";
  if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("fetch")) {
    return "Sin conexión con el servidor. Revisá internet o usá Chrome actualizado en Windows 10/11.";
  }
  if (msg.includes("invalid login") || msg.includes("invalid credentials")) {
    return "Correo o contraseña incorrectos";
  }
  if (msg.includes("email not confirmed")) {
    return "La cuenta aún no está confirmada. Pedile al administrador que la active.";
  }
  return error?.message ?? "No se pudo iniciar sesión";
}
