import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, isSupported, type Messaging } from "firebase/messaging";

export const firebaseConfig = {
  apiKey: "AIzaSyCZqQWOBh3VLQX_JZpM2s9llgA3exZ-Zsk",
  authDomain: "ajpnot.firebaseapp.com",
  projectId: "ajpnot",
  storageBucket: "ajpnot.firebasestorage.app",
  messagingSenderId: "854860774617",
  appId: "1:854860774617:web:a094a08e00183834fb52c8",
  measurementId: "G-Q3NHR9HN5Y",
};

export const VAPID_KEY =
  "BB1xOv1biDHwS6qr7fFPomt9dtLwV1kKwx8VhhN_JhDnhKsEhS5Y4tw_2SEGMXFkYrG0sCn7x1-7wB9H4jDJHQY";

let app: FirebaseApp | null = null;
export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  app = getApps()[0] ?? initializeApp(firebaseConfig);
  return app;
}

export async function getMessagingIfSupported(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  try {
    const ok = await isSupported();
    if (!ok) return null;
    return getMessaging(getFirebaseApp());
  } catch {
    return null;
  }
}
