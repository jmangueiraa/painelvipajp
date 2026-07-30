// Captura o evento de instalação o mais cedo possível.
// O Chrome dispara `beforeinstallprompt` logo no carregamento — antes do React
// hidratar — então sem esse captador global o evento é perdido e o botão de
// instalar nunca funciona.

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Listener = (e: BeforeInstallPromptEvent | null) => void;

const listeners = new Set<Listener>();
let deferred: BeforeInstallPromptEvent | null = null;

export function getDeferredInstallPrompt() {
  return deferred;
}

export function setDeferredInstallPrompt(e: BeforeInstallPromptEvent | null) {
  deferred = e;
  listeners.forEach((l) => l(deferred));
}

export function subscribeInstallPrompt(listener: Listener) {
  listeners.add(listener);
  listener(deferred);
  return () => {
    listeners.delete(listener);
  };
}

if (typeof window !== "undefined") {
  const w = window as unknown as { __portalInstallCaptured?: boolean };
  if (!w.__portalInstallCaptured) {
    w.__portalInstallCaptured = true;
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      setDeferredInstallPrompt(e as BeforeInstallPromptEvent);
    });
    window.addEventListener("appinstalled", () => {
      setDeferredInstallPrompt(null);
    });
  }
}
