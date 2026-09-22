// Portal VIP - unified PWA cache and Firebase Messaging service worker.
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCZqQWOBh3VLQX_JZpM2s9llgA3exZ-Zsk",
  authDomain: "ajpnot.firebaseapp.com",
  projectId: "ajpnot",
  storageBucket: "ajpnot.firebasestorage.app",
  messagingSenderId: "854860774617",
  appId: "1:854860774617:web:a094a08e00183834fb52c8",
  measurementId: "G-Q3NHR9HN5Y",
});

const messaging = firebase.messaging();
const VERSION = "v3";
const STATIC_CACHE = `portal-static-${VERSION}`;
const RUNTIME_CACHE = `portal-runtime-${VERSION}`;
const APP_SHELL = ["/portal/", "/portal/painel", "/portal-manifest.webmanifest", "/portal-icon-192.png", "/portal-icon-512.png"];

messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const data = payload.data || {};

  // FCM displays payloads containing notification fields automatically.
  // Data-only messages are displayed here so they also work with the PWA closed.
  if (notification.title || notification.body) return;

  return self.registration.showNotification(data.title || "Portal VIP", {
    body: data.body || "",
    icon: "/portal-icon-192.png",
    badge: "/portal-icon-192.png",
    requireInteraction: true,
    tag: `portal-vip-${Date.now()}`,
    renotify: true,
    data: { ...data, url: data.url || "/portal/painel" },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const currentOrigin = (self.location && self.location.origin) ? self.location.origin : "https://portalajp.com.br";
  const TARGET = `${currentOrigin}/portal`;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const scoped = all.find((c) => {
        try { return new URL(c.url).pathname.startsWith("/portal"); } catch { return false; }
      });
      if (scoped) {
        try { await scoped.navigate(TARGET); } catch {}
        if ("focus" in scoped) return scoped.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(TARGET);
    })(),
  );
});

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
          return cached || caches.match("/portal/");
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
