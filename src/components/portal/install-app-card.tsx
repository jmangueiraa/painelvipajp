import { useEffect, useState } from "react";
import { Smartphone, Share, Plus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
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
function useRegisterPortalSW() {
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
      .register("/portal-sw.js", { scope: "/portal" })
      .catch(() => undefined);
  }, []);
}

export function InstallAppCard() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIOS, setShowIOS] = useState(false);

  useRegisterPortalSW();

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
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
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setDeferred(null);
      return;
    }
    setShowIOS((v) => !v);
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
          <Plus className="mr-2 h-4 w-4" />
          📲 Instalar Aplicativo
        </Button>
        {showIOS && (
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
                  Como instalar
                </div>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Abra o menu do navegador (⋮ ou ⋯).</li>
                  <li>Toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
                  <li>Confirme para criar o ícone do app.</li>
                </ol>
                <p className="mt-2 text-xs text-muted-foreground">
                  Dica: alguns navegadores só liberam a instalação após alguns segundos de uso.
                </p>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
