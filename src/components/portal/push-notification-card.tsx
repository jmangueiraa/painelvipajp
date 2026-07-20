import { useEffect, useState } from "react";
import { Bell, BellRing, CheckCircle2, Loader2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function detectPlatform(): "ios" | "android" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

type PushState = "checking" | "unsupported" | "blocked" | "inactive" | "activating" | "active" | "error";

function currentState(): PushState {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission === "granted" && window.localStorage.getItem("portal_fcm_token")) return "active";
  return "inactive";
}

export function PushNotificationCard() {
  const [state, setState] = useState<PushState>("checking");
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => setState(currentState()), []);

  async function activate() {
    if (currentState() === "blocked") {
      setHelpOpen(true);
      return;
    }
    setState("activating");
    try {
      const { initPortalPush } = await import("@/lib/fcm");
      const token = await initPortalPush({ silent: false });
      const next = token ? "active" : currentState() === "blocked" ? "blocked" : "error";
      setState(next);
      if (next === "blocked") setHelpOpen(true);
    } catch {
      setState("error");
    }
  }

  if (state === "checking" || state === "unsupported") return null;

  if (state === "active") {
    return (
      <Card className="border-success/40 bg-success/5">
        <CardContent className="flex items-center gap-3 p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
          <div>
            <div className="text-sm font-semibold">Notificações ativadas</div>
            <div className="text-xs text-muted-foreground">Este celular está pronto para receber seus avisos.</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-warning/40 bg-warning/5">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <div className="text-sm font-semibold">Ativar notificações</div>
              <div className="text-xs text-muted-foreground">
                {state === "blocked"
                  ? "A permissão está bloqueada. Toque abaixo para ver como liberar em poucos passos."
                  : state === "error"
                    ? "Não foi possível concluir. Verifique a conexão e tente novamente."
                    : "Toque abaixo e permita para receber avisos neste celular."}
              </div>
            </div>
          </div>
          <Button type="button" className="w-full" onClick={activate} disabled={state === "activating"}>
            {state === "activating" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : state === "blocked" ? (
              <Settings className="mr-2 h-4 w-4" />
            ) : (
              <Bell className="mr-2 h-4 w-4" />
            )}
            {state === "activating"
              ? "Ativando..."
              : state === "blocked"
                ? "Como liberar notificações"
                : "Permitir notificações"}
          </Button>
        </CardContent>
      </Card>

      <PermissionHelpDialog open={helpOpen} onOpenChange={setHelpOpen} onRetry={activate} />
    </>
  );
}

function PermissionHelpDialog({
  open,
  onOpenChange,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRetry: () => void;
}) {
  const platform = detectPlatform();
  const steps =
    platform === "ios"
      ? [
          "Abra os Ajustes do iPhone.",
          "Role até encontrar este app (ou Safari, se abriu pelo navegador).",
          "Toque em Notificações e ative Permitir notificações.",
          "Volte aqui e toque em Tentar novamente.",
        ]
      : platform === "android"
        ? [
            "Abra as Configurações do celular.",
            "Vá em Apps → este aplicativo (ou Chrome, se abriu pelo navegador).",
            "Toque em Notificações e ative a permissão.",
            "Volte aqui e toque em Tentar novamente.",
          ]
        : [
            "Clique no cadeado 🔒 ao lado do endereço no topo do navegador.",
            "Encontre Notificações e mude para Permitir.",
            "Atualize a página.",
            "Volte aqui e clique em Tentar novamente.",
          ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Liberar notificações</DialogTitle>
          <DialogDescription>
            O navegador não permite que o app abra a tela de permissão sozinho. Siga o passo a passo abaixo:
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-2 text-sm">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
        <Button
          className="w-full"
          onClick={() => {
            onOpenChange(false);
            setTimeout(onRetry, 200);
          }}
        >
          <Bell className="mr-2 h-4 w-4" />
          Já liberei, tentar novamente
        </Button>
      </DialogContent>
    </Dialog>
  );
}