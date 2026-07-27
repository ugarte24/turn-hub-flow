/** Notificaciones del sistema + sonido (visibles en segundo plano). */

export type DesktopNotifyPermission = NotificationPermission | "unsupported";

const SW_URL = "/notify-sw.js";

export function getDesktopNotifyPermission(): DesktopNotifyPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function ensureDesktopNotifyPermission(): Promise<DesktopNotifyPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/** Registra el SW usado para mostrar toasts de Windows de forma más fiable. */
export async function registerNotifyServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  } catch {
    return null;
  }
}

function playNotifyBeep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const beep = (offset: number, freq: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, now + offset);
      g.gain.exponentialRampToValueAtTime(0.22, now + offset + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.28);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(now + offset);
      o.stop(now + offset + 0.3);
    };
    beep(0, 880);
    beep(0.32, 1175);
    window.setTimeout(() => void ctx.close(), 900);
  } catch {
    /* ignore */
  }
}

export async function showDesktopNotify(opts: {
  title: string;
  body: string;
  tag?: string;
  withSound?: boolean;
}): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (opts.withSound !== false) playNotifyBeep();

  if (!("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;

  const options: NotificationOptions = {
    body: opts.body,
    tag: opts.tag ?? `sigat-${Date.now()}`,
    renotify: true,
    requireInteraction: true,
    icon: "/sigat-icon.png",
    badge: "/sigat-icon.png",
    silent: false,
  };

  // Preferir Service Worker: en Chrome/Edge Windows muestra mejor el toast del sistema
  try {
    const reg =
      (await navigator.serviceWorker?.getRegistration("/"))
      ?? (await registerNotifyServiceWorker());
    if (reg) {
      await reg.showNotification(opts.title, options);
      return true;
    }
  } catch {
    /* cae al fallback */
  }

  try {
    const n = new Notification(opts.title, options);
    n.onclick = () => {
      try { window.focus(); } catch { /* ignore */ }
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}
