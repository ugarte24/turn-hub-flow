/** Notificaciones del sistema (visibles aunque la app esté en segundo plano). */

export type DesktopNotifyPermission = NotificationPermission | "unsupported";

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

export function showDesktopNotify(opts: {
  title: string;
  body: string;
  tag?: string;
}): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag,
      renotify: true,
      requireInteraction: true,
      icon: "/sigat-icon.png",
    });
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      n.close();
    };
  } catch {
    /* Algunos entornos bloquean Notification fuera de gesto de usuario */
  }
}
