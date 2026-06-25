import { useEffect, useRef, useState } from "react";
import { Smartphone, Share, Plus, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const INSTALLED_KEY = "portal_app_installed";

function markInstalled() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(INSTALLED_KEY, "true");
}

function wasMarkedInstalled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(INSTALLED_KEY) === "true";
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

// Registra/desregistra o service worker do portal
export function useRegisterPortalSW() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (isPreviewOrDev()) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => {
          if (r.active?.scriptURL.endsWith("/portal-sw.js")) r.unregister();
        });
      });
      return;
    }
    navigator.serviceWorker
      .register("/portal-sw.js", { scope: "/portal/" })
      .catch(() => undefined);
  }, []);
}

export function InstallAppCard() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [waitingPrompt, setWaitingPrompt] = useState(false);
  const pendingInstallClick = useRef(false);

  useRegisterPortalSW();

  useEffect(() => {
    if (isInstalledDisplayMode() || wasMarkedInstalled()) {
      if (isInstalledDisplayMode()) markInstalled();
      setInstalled(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setWaitingPrompt(false);
      setShowHelp(false);

      if (pendingInstallClick.current) {
        pendingInstallClick.current = false;
        void openNativePrompt(promptEvent);
        return;
      }

      setDeferred(promptEvent);
    };
    const onInstalled = () => {
      markInstalled();
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
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

    if (isIOS()) {
      setShowHelp((v) => !v);
      return;
    }

    pendingInstallClick.current = true;
    setShowHelp(false);
    setWaitingPrompt(true);
    setTimeout(() => {
      if (!pendingInstallClick.current) return;
      pendingInstallClick.current = false;
      setWaitingPrompt(false);
      setShowHelp(true);
    }, 6000);
  }

  async function openNativePrompt(promptEvent: BeforeInstallPromptEvent) {
    try {
      setWaitingPrompt(false);
      setShowHelp(false);
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") {
        markInstalled();
        setInstalled(true);
      }
    } finally {
      setDeferred(null);
      pendingInstallClick.current = false;
    }
  }

  const canPrompt = !!deferred;
  const ios = isIOS();

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
        <Button onClick={handleInstall} size="lg" className="w-full sm:w-auto">
          {waitingPrompt ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          📲 Instalar Aplicativo
        </Button>
        {waitingPrompt && (
          <p className="text-xs text-muted-foreground">
            Preparando instalação automática. Se não abrir, acesse o portal publicado direto no Chrome/Edge do celular.
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
                  Instalação não liberada pelo navegador
                </div>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Abra o portal publicado direto no <strong>Chrome</strong> ou <strong>Edge</strong>, fora do WhatsApp/Facebook.</li>
                  <li>Toque novamente em <strong>Instalar Aplicativo</strong>.</li>
                  <li>Se aparecer no menu do navegador, toque em <strong>Instalar app</strong>.</li>
                </ol>
                <p className="mt-2 text-xs text-muted-foreground">
                  O botão só consegue abrir a instalação quando o navegador envia a permissão nativa de instalação.
                </p>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
