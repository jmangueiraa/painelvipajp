import { useEffect, useState } from "react";
import { Smartphone, Share, Plus, CheckCircle2, Loader2, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const INSTALLED_KEY = "portal_app_installed";
const PROMPT_WAIT_MS = 2500;

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
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [checkingPrompt, setCheckingPrompt] = useState(true);

  useRegisterPortalSW();

  useEffect(() => {
    // Só esconde o card quando o app está realmente aberto em modo instalado.
    // (Não usamos mais o flag de localStorage, que escondia o card no navegador.)
    if (isInstalledDisplayMode()) {
      markInstalled();
      setInstalled(true);
      return;
    }
    const timer = window.setTimeout(() => setCheckingPrompt(false), PROMPT_WAIT_MS);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setCheckingPrompt(false);
      setShowHelp(false);
      setDeferred(promptEvent);
    };
    const onInstalled = () => {
      markInstalled();
      setInstalled(true);
      setDeferred(null);
      // Notifica o backend para popular a lista "Portal dos Clientes"
      import("@/lib/portal-client").then(({ portalFetch }) => {
        portalFetch("/api/public/portal/register-install", {
          method: "POST",
          body: JSON.stringify({ platform: navigator.userAgent }),
        }).catch(() => undefined);
      });
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  async function handleInstall() {
    if (deferred) {
      await openNativePrompt(deferred);
      return;
    }

    setCheckingPrompt(false);
    setShowHelp((v) => !v);
  }

  async function openNativePrompt(promptEvent: BeforeInstallPromptEvent) {
    try {
      setCheckingPrompt(false);
      setShowHelp(false);
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") {
        markInstalled();
        setInstalled(true);
      }
    } finally {
      setDeferred(null);
    }
  }

  const canPrompt = !!deferred;
  const ios = isIOS();
  const android = isAndroid();
  const inAppBrowser = isInAppBrowser();
  const actionLabel = canPrompt ? "📲 Instalar Aplicativo" : checkingPrompt ? "Preparando instalador" : "Ver como instalar";

  return (
    <Card className="border-primary/40 bg-gradient-to-br from-primary/10 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-4 w-4" />Instalar aplicativo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Adicione o portal à tela inicial e acesse como um app nativo — abre em tela cheia, sem barra do navegador.
        </p>
        <Button onClick={handleInstall} size="lg" className="w-full sm:w-auto" disabled={checkingPrompt && !canPrompt}>
          {checkingPrompt && !canPrompt ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          {actionLabel}
        </Button>
        {checkingPrompt && !canPrompt && (
          <p className="text-xs text-muted-foreground">
            Validando o instalador nativo do navegador. Se ele não liberar, mostraremos o caminho manual correto.
          </p>
        )}
        {showHelp && (
          <div className="rounded-xl border bg-card p-3 text-sm">
            {ios ? (
              <>
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Como instalar no iPhone (Safari)
                </div>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Toque em <Share className="inline h-3.5 w-3.5" /> <strong>Compartilhar</strong> na barra do Safari.</li>
                  <li>Role e toque em <strong>Adicionar à Tela de Início</strong>.</li>
                  <li>Confirme em <strong>Adicionar</strong>.</li>
                </ol>
              </>
            ) : canPrompt ? null : (
              <>
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Instalação pelo menu do navegador
                </div>
                {inAppBrowser ? (
                  <ol className="list-decimal space-y-1 pl-5">
                    <li>Toque em <MoreVertical className="inline h-3.5 w-3.5" /> e escolha <strong>Abrir no navegador</strong>.</li>
                    <li>Abra no <strong>Chrome</strong> ou <strong>Edge</strong>.</li>
                    <li>No menu do navegador, toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
                  </ol>
                ) : android ? (
                  <ol className="list-decimal space-y-1 pl-5">
                    <li>Abra o menu <MoreVertical className="inline h-3.5 w-3.5" /> do <strong>Chrome</strong> ou <strong>Edge</strong>.</li>
                    <li>Toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
                    <li>Confirme em <strong>Instalar</strong>.</li>
                  </ol>
                ) : (
                  <ol className="list-decimal space-y-1 pl-5">
                    <li>Abra o menu do navegador.</li>
                    <li>Escolha <strong>Instalar Portal VIP</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
                    <li>Confirme a instalação.</li>
                  </ol>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Quando o navegador liberar o instalador automático, este botão muda para instalar direto.
                </p>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
