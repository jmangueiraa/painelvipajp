// Portal VIP - Service Worker (NetworkFirst para HTML, CacheFirst para estáticos)
const VERSION = "v1";
const STATIC_CACHE = `portal-static-${VERSION}`;
const RUNTIME_CACHE = `portal-runtime-${VERSION}`;
const APP_SHELL = ["/portal", "/portal-manifest.webmanifest", "/portal-icon-192.png", "/portal-icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(APP_SHELL).catch(() => undefined)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("portal-") && !k.endsWith(VERSION)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Nunca interceptar APIs/auth
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/~oauth")) return;

  // HTML / navegação: NetworkFirst
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, fresh.clone()).catch(() => undefined);
          return fresh;
        } catch {
          const cached = await caches.match(req);
          return cached || caches.match("/portal");
        }
      })(),
    );
    return;
  }

  // Estáticos hasheados: CacheFirst
  if (/\.(?:js|css|png|jpg|jpeg|svg|webp|woff2?|ttf|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((resp) => {
            const copy = resp.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
            return resp;
          })
          .catch(() => cached);
      }),
    );
  }
});
