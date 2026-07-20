/* eslint-disable */
// Firebase Cloud Messaging service worker
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

messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const data = payload.data || {};
  const title = n.title || data.title || "Portal VIP";
  const options = {
    body: n.body || data.body || "",
    icon: "/portal-icon-192.png",
    badge: "/portal-icon-192.png",
    requireInteraction: true,
    tag: "portal-vip-" + Date.now(),
    renotify: true,
    data: { url: data.url || "/portal/painel", ...data },
  };
  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/portal/painel";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
