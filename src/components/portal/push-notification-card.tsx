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

  useEffect(() => setState(currentState()), []);

  async function activate() {
    setState("activating");
    try {
      const { initPortalPush } = await import("@/lib/fcm");
      const token = await initPortalPush({ silent: false });
      setState(token ? "active" : currentState() === "blocked" ? "blocked" : "error");
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
    <Card className="border-warning/40 bg-warning/5">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div>
            <div className="text-sm font-semibold">Ativar notificações</div>
            <div className="text-xs text-muted-foreground">
              {state === "blocked"
                ? "A permissão está bloqueada. Libere Notificações nas configurações deste aplicativo e volte aqui."
                : state === "error"
                  ? "Não foi possível concluir. Verifique a conexão e tente novamente."
                  : "Toque abaixo e permita para receber avisos neste celular."}
            </div>
          </div>
        </div>
        <Button type="button" className="w-full" onClick={activate} disabled={state === "activating"}>
          {state === "activating" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
          {state === "activating"
            ? "Ativando..."
            : state === "blocked"
              ? "Tentar ativar novamente"
              : "Permitir notificações"}
        </Button>
      </CardContent>
    </Card>
  );
}