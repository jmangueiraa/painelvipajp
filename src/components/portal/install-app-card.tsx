import { useEffect, useState } from "react";
import { Smartphone, Share, Plus, CheckCircle2, MoreVertical, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getDeferredInstallPrompt,
  setDeferredInstallPrompt,
  subscribeInstallPrompt,
  type BeforeInstallPromptEvent,
} from "@/lib/pwa-install";

const INSTALLED_KEY = "portal_app_installed";

function markInstalled() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(INSTALLED_KEY, "true");
}




function isInstalledDisplayMode() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: minimal-ui)").matches ||
    // @ts-expect-error iOS specific
    window.navigator.standalone === true
  );
}

function isIOS() {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent) && !/CriOS|FxiOS/.test(window.navigator.userAgent);
}

function isAndroid() {
  if (typeof window === "undefined") return false;
  return /Android/i.test(window.navigator.userAgent);
}

function isInAppBrowser() {
  if (typeof window === "undefined") return false;
  return /FBAN|FBAV|Instagram|Line|MicroMessenger|WhatsApp|wv\)/i.test(window.navigator.userAgent);
}

function isPreviewOrDev() {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  if (window.self !== window.top) return true;
  const h = window.location.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return true;
  if (h === "lovableproject.com" || h.endsWith(".lovableproject.com")) return true;
  if (h === "lovableproject-dev.com" || h.endsWith(".lovableproject-dev.com")) return true;
  if (h === "beta.lovable.dev" || h.endsWith(".beta.lovable.dev")) return true;
  if (window.location.search.includes("sw=off")) return true;
  return false;
}

// Registra o único service worker do portal (PWA + notificações Firebase).
export function useRegisterPortalSW() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const isPortalWorker = (registration: ServiceWorkerRegistration) =>
      [registration.active, registration.installing, registration.waiting].some((worker) => worker?.scriptURL.endsWith("/portal-sw.js"));

    const unregisterPortalWorkers = (keepScope?: string) => {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((registration) => {
          if (!isPortalWorker(registration)) return;
          if (keepScope && registration.scope === keepScope) return;
          registration.unregister().catch(() => undefined);
        });
      }).catch(() => undefined);
    };

    if (isPreviewOrDev()) {
      unregisterPortalWorkers();
      return;
    }
    navigator.serviceWorker
      .register("/portal-sw.js", { scope: "/" })
      .then(async (registration) => {
        await registration.update().catch(() => undefined);
        unregisterPortalWorkers(registration.scope);
      })
      .catch(() => undefined);
  }, []);
}

export function InstallAppCard() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(() =>
    getDeferredInstallPrompt(),
  );
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useRegisterPortalSW();

  useEffect(() => {
    // Só esconde o card quando o app está realmente aberto em modo instalado.
    if (isInstalledDisplayMode()) {
      markInstalled();
      setInstalled(true);
      return;
    }
    // O evento pode ter sido capturado antes do React montar (captador global).
    const unsubscribe = subscribeInstallPrompt((e) => {
      if (e) setShowHelp(false);
      setDeferred(e);
    });
    const onInstalled = () => {
      markInstalled();
      setInstalled(true);
      setDeferredInstallPrompt(null);
      // Notifica o backend para popular a lista "Portal dos Clientes"
      import("@/lib/portal-client").then(({ portalFetch }) => {
        portalFetch("/api/public/portal/register-install", {
          method: "POST",
          body: JSON.stringify({ platform: navigator.userAgent }),
        }).catch(() => undefined);
      });
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      unsubscribe();
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  async function handleInstall() {
    const promptEvent = deferred ?? getDeferredInstallPrompt();
    if (promptEvent) {
      await openNativePrompt(promptEvent);
      return;
    }

    setShowHelp((v) => !v);
  }

  async function openNativePrompt(promptEvent: BeforeInstallPromptEvent) {
    try {
      setShowHelp(false);
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") {
        markInstalled();
        setInstalled(true);
      }
    } finally {
      setDeferredInstallPrompt(null);
    }
  }


  const canPrompt = !!deferred;
  const ios = isIOS();
  const android = isAndroid();
  const inAppBrowser = isInAppBrowser();
  const actionLabel = canPrompt ? "📲 Instalar Aplicativo" : "Ver como instalar";

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={handleInstall}
        className="w-full rounded-2xl bg-white/15 hover:bg-white/20 active:scale-[0.99] border border-white/25 p-3.5 sm:p-4 flex items-center justify-between text-left transition backdrop-blur-md cursor-pointer shadow-lg shadow-black/5"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl border-2 border-white/80 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-white stroke-[2.2]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-bold text-sm sm:text-base leading-tight">
              Instalar aplicativo
            </h3>
            <p className="text-white/90 text-[11px] sm:text-xs mt-0.5 leading-snug">
              Adicione o portal à tela inicial e acesse como seu app!
            </p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-white/90 shrink-0 ml-2 stroke-[2.5]" />
      </button>

      {showHelp && (
        <div className="mt-2.5 rounded-2xl bg-white p-4 text-xs text-slate-800 shadow-xl border border-white/50 animate-in fade-in slide-in-from-top-2 duration-200">
          {ios ? (
            <>
              <div className="mb-2 flex items-center gap-2 font-bold text-slate-900 text-sm">
                <CheckCircle2 className="h-4 w-4 text-[#FF5500]" />
                Como instalar no iPhone (Safari)
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-slate-700 leading-relaxed">
                <li>Toque em <Share className="inline h-3.5 w-3.5 text-[#FF5500]" /> <strong>Compartilhar</strong> na barra inferior do Safari.</li>
                <li>Role a lista e toque em <strong>Adicionar à Tela de Início</strong>.</li>
                <li>Confirme tocando em <strong>Adicionar</strong> no canto superior direito.</li>
              </ol>
            </>
          ) : canPrompt ? null : (
            <>
              <div className="mb-2 flex items-center gap-2 font-bold text-slate-900 text-sm">
                <CheckCircle2 className="h-4 w-4 text-[#FF5500]" />
                Instalação pelo menu do navegador
              </div>
              {inAppBrowser ? (
                <ol className="list-decimal space-y-1 pl-5 text-slate-700 leading-relaxed">
                  <li>Toque nos três pontinhos <MoreVertical className="inline h-3.5 w-3.5" /> e escolha <strong>Abrir no navegador</strong>.</li>
                  <li>Abra no <strong>Chrome</strong> ou <strong>Edge</strong>.</li>
                  <li>No menu do navegador, toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
                </ol>
              ) : android ? (
                <ol className="list-decimal space-y-1 pl-5 text-slate-700 leading-relaxed">
                  <li>Abra o menu <MoreVertical className="inline h-3.5 w-3.5" /> do <strong>Chrome</strong>.</li>
                  <li>Toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
                  <li>Confirme em <strong>Instalar</strong>.</li>
                </ol>
              ) : (
                <ol className="list-decimal space-y-1 pl-5 text-slate-700 leading-relaxed">
                  <li>Abra o menu do navegador.</li>
                  <li>Escolha <strong>Instalar Portal VIP</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
                  <li>Confirme a instalação.</li>
                </ol>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
