/* Service worker mínimo para notificaciones de derivación SIGAT */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try { await client.navigate("/operator"); } catch { /* ignore */ }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow("/operator");
      }
    })(),
  );
});
