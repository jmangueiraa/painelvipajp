import { getToken, onMessage } from "firebase/messaging";
import { toast } from "sonner";
import { getMessagingIfSupported, VAPID_KEY } from "./firebase";
import { portalFetch, getPortalToken } from "./portal-client";

const SAVED_TOKEN_KEY = "portal_fcm_token";

async function registerSw(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
    await registration.update();
    return registration;
  } catch (e) {
    console.warn("[fcm] sw register failed", e);
    return null;
  }
}

export async function initPortalPush(opts: { silent?: boolean } = {}): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!("Notification" in window)) return null;
  if (!getPortalToken()) return null;

  const messaging = await getMessagingIfSupported();
  if (!messaging) return null;

  let permission = Notification.permission;
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch {
      return null;
    }
  }
  if (permission !== "granted") return null;

  const swReg = await registerSw();
  if (!swReg) return null;

  let token: string | null = null;
  try {
    token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
  } catch (e) {
    console.warn("[fcm] getToken failed", e);
    if (!opts.silent) toast.error("Não foi possível ativar notificações push");
    return null;
  }
  if (!token) return null;

  try {
    // Refresh the server record on every portal session. This repairs tokens
    // that were generated locally but failed to save during an earlier visit.
    await portalFetch("/api/public/portal/save-push-token", {
      method: "POST",
      body: JSON.stringify({ token, platform: navigator.userAgent }),
    });
    window.localStorage.setItem(SAVED_TOKEN_KEY, token);
  } catch (e) {
    console.warn("[fcm] save token failed", e);
    if (!opts.silent) toast.error("Não foi possível registrar este aparelho para notificações");
  }

  onMessage(messaging, async (payload) => {
    const n = payload.notification;
    const title = n?.title || (payload.data?.title as string) || "Portal VIP";
    const body = n?.body || (payload.data?.body as string) || "";
    const url = (payload.data?.url as string) || "/portal/painel";
    try {
      await swReg.showNotification(title, {
        body,
        icon: "/portal-icon-192.png",
        badge: "/portal-icon-192.png",
        requireInteraction: true,
        tag: "portal-vip-" + Date.now(),
        renotify: true,
        data: { url, ...(payload.data || {}) },
      } as NotificationOptions);
    } catch {
      toast(title, { description: body, duration: 600000 });
    }
  });

  return token;
}
