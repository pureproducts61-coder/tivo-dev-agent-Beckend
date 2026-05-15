// Minimal offline-tolerant SW for TIVO PWA
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith(
    fetch(req).catch(() => caches.match(req).then((r) => r || new Response("offline", { status: 503 })))
  );
});
self.addEventListener("push", (event) => {
  const data = (() => { try { return event.data?.json() || {}; } catch { return {}; } })();
  const title = data.title || "TIVO";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "", icon: "/placeholder.svg", badge: "/placeholder.svg", data,
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/super-admin/dashboard"));
});
