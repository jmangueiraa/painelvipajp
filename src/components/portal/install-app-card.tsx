import { useEffect, useState } from "react";
import { Smartphone, Share, Plus } from "lucide-react";
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
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
}

export function InstallAppCard() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIOS, setShowIOS] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
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
    if (isIOS()) {
      setShowIOS((v) => !v);
      return;
    }
    setShowIOS((v) => !v);
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-4 w-4" />Instalar Portal no celular
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Tenha acesso rápido pelo ícone na tela inicial, como um aplicativo.
        </p>
        <Button onClick={handleInstall} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          {deferred ? "Instalar agora" : isIOS() ? "Como instalar no iPhone" : "Como instalar"}
        </Button>
        {showIOS && (
          <div className="rounded-xl border bg-card p-3 text-sm">
            {isIOS() ? (
              <ol className="list-decimal space-y-1 pl-5">
                <li>Toque em <Share className="inline h-3.5 w-3.5" /> <strong>Compartilhar</strong> na barra do Safari.</li>
                <li>Role e toque em <strong>Adicionar à Tela de Início</strong>.</li>
                <li>Confirme em <strong>Adicionar</strong>.</li>
              </ol>
            ) : (
              <ol className="list-decimal space-y-1 pl-5">
                <li>Abra o menu do navegador (⋮).</li>
                <li>Toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
                <li>Confirme para criar o ícone.</li>
              </ol>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
