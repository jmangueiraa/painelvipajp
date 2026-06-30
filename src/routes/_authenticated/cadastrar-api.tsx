import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wallet, Send, MessageSquare, QrCode, RefreshCw, LogOut } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

import { translateError } from "@/lib/translate-error";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/cadastrar-api")({
  head: () => ({ meta: [{ title: "Cadastrar API — Painel VIP" }] }),
  component: CadastrarApiPage,
});

type Settings = {
  mp_access_token: string | null;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  zapi_instance_id: string | null;
  zapi_token: string | null;
  zapi_client_token: string | null;
};

function SectionCard({
  title, description, icon: Icon, color, children,
}: { title: string; description?: string; icon: React.ElementType; color: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div
          className="size-10 rounded-xl grid place-items-center shrink-0"
          style={{
            background: `color-mix(in oklab, ${color} 15%, transparent)`,
            color,
            border: `1px solid color-mix(in oklab, ${color} 45%, transparent)`,
          }}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function CadastrarApiPage() {
  const qc = useQueryClient();
  const { user } = useAuth();


  const { data: settings } = useQuery({
    queryKey: ["settings", "apis"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("mp_access_token,telegram_bot_token,telegram_chat_id,zapi_instance_id,zapi_token,zapi_client_token")
        .maybeSingle();
      if (error) throw error;
      return (data ?? {}) as Settings;
    },
  });

  const [mp, setMp] = useState("");
  const [tgToken, setTgToken] = useState("");
  const [tgChat, setTgChat] = useState("");
  const [zInst, setZInst] = useState("");
  const [zTok, setZTok] = useState("");
  const [zCli, setZCli] = useState("");
  const [showMp, setShowMp] = useState(false);
  const [showTg, setShowTg] = useState(false);
  const [showZ, setShowZ] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setMp(settings.mp_access_token ?? "");
    setTgToken(settings.telegram_bot_token ?? "");
    setTgChat(settings.telegram_chat_id ?? "");
    setZInst(settings.zapi_instance_id ?? "");
    setZTok(settings.zapi_token ?? "");
    setZCli(settings.zapi_client_token ?? "");
  }, [settings]);

  const save = useMutation({
    mutationFn: async (patch: Partial<Settings>) => {
      if (!user) throw new Error("Sem sessão");
      const { error } = await supabase.from("settings").update(patch).eq("user_id", user.id);
      if (error) throw error;
    },

    onSuccess: () => {
      toast.success("Salvo");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const testTelegram = useMutation({
    mutationFn: async () => {
      const { notifyEventFn } = await import("@/lib/notifications.functions");
      const res = await notifyEventFn({
        data: { event: "new_sale", payload: { nome: "Teste", valor: "0,00", plano: "Mensagem de teste" } },
      });
      if (!res?.ok) throw new Error(res?.reason || "Falha ao enviar");
    },
    onSuccess: () => toast.success("Mensagem de teste enviada"),
    onError: (e: Error) => toast.error(translateError(e)),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Cadastrar API" description="Configure as integrações do seu sistema: Mercado Pago, Telegram e WhatsApp." />

      <SectionCard
        title="Mercado Pago"
        description="Access Token de PRODUÇÃO (APP_USR-...) para receber pagamentos PIX e Cartão."
        icon={Wallet}
        color="var(--kpi-cyan)"
      >
        <div className="space-y-1">
          <Label>Access Token</Label>
          <div className="flex gap-2">
            <Input
              type={showMp ? "text" : "password"}
              placeholder="APP_USR-xxxxxxxx-xxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxxx"
              value={mp}
              onChange={(e) => setMp(e.target.value)}
              autoComplete="off"
            />
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setShowMp((v) => !v)}>
              {showMp ? "Ocultar" : "Mostrar"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Gere em <a className="underline" target="_blank" rel="noreferrer" href="https://www.mercadopago.com.br/developers/panel/app">Painel do desenvolvedor → Credenciais de produção</a>.
          </p>
        </div>
        <Button
          className="btn-premium rounded-full"
          onClick={() => save.mutate({ mp_access_token: mp.trim() || null })}
          disabled={save.isPending}
        >
          Salvar Mercado Pago
        </Button>
      </SectionCard>

      <SectionCard
        title="Telegram"
        description="Receba alertas de vendas, renovações e novos clientes diretamente no Telegram."
        icon={Send}
        color="var(--kpi-amber)"
      >
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-100/90">
          1) Crie um bot em <a className="underline" target="_blank" rel="noreferrer" href="https://t.me/BotFather">@BotFather</a> para obter o <strong>Bot Token</strong>.<br />
          2) Inicie uma conversa com o seu bot e descubra seu <strong>Chat ID</strong> em <a className="underline" target="_blank" rel="noreferrer" href="https://t.me/userinfobot">@userinfobot</a>.
        </div>
        <div className="space-y-1">
          <Label>Bot Token</Label>
          <div className="flex gap-2">
            <Input
              type={showTg ? "text" : "password"}
              placeholder="123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={tgToken}
              onChange={(e) => setTgToken(e.target.value)}
              autoComplete="off"
            />
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setShowTg((v) => !v)}>
              {showTg ? "Ocultar" : "Mostrar"}
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Chat ID</Label>
          <Input
            placeholder="Ex: 8010768365"
            value={tgChat}
            onChange={(e) => setTgChat(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="btn-premium rounded-full"
            onClick={() => save.mutate({ telegram_bot_token: tgToken.trim() || null, telegram_chat_id: tgChat.trim() || null })}
            disabled={save.isPending}
          >
            Salvar Telegram
          </Button>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => testTelegram.mutate()}
            disabled={testTelegram.isPending}
          >
            <Send className="size-4 mr-2" />
            {testTelegram.isPending ? "Enviando..." : "Enviar mensagem de teste"}
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="WhatsApp (Z-API)"
        description="Conecte seu WhatsApp via Z-API para envio automático de cobranças."
        icon={MessageSquare}
        color="var(--kpi-emerald)"
      >
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-100/90">
          Crie uma instância em <a className="underline" target="_blank" rel="noreferrer" href="https://app.z-api.io/">app.z-api.io</a> e copie os campos abaixo. O <strong>Client-Token</strong> é opcional (Account Security Token).
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Instance ID</Label>
            <Input value={zInst} onChange={(e) => setZInst(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-1">
            <Label>Token da instância</Label>
            <div className="flex gap-2">
              <Input type={showZ ? "text" : "password"} value={zTok} onChange={(e) => setZTok(e.target.value)} autoComplete="off" />
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setShowZ((v) => !v)}>
                {showZ ? "Ocultar" : "Mostrar"}
              </Button>
            </div>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Client-Token (opcional)</Label>
            <Input value={zCli} onChange={(e) => setZCli(e.target.value)} autoComplete="off" />
          </div>
        </div>
        <Button
          className="btn-premium rounded-full"
          onClick={() => save.mutate({
            zapi_instance_id: zInst.trim() || null,
            zapi_token: zTok.trim() || null,
            zapi_client_token: zCli.trim() || null,
          })}
          disabled={save.isPending}
        >
          Salvar WhatsApp
        </Button>

        <WhatsAppConnectBlock />
      </SectionCard>
    </div>
  );
}

function WhatsAppConnectBlock() {
  const qc = useQueryClient();

  async function zapiFetch<T>(path: string): Promise<T> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessão expirada");
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Falha (HTTP ${res.status})`);
    return body as T;
  }

  const status = useQuery({
    queryKey: ["zapi", "status"],
    queryFn: () => zapiFetch<{ configured: boolean; connected: boolean }>("/api/public/zapi/status"),
    refetchInterval: 8000,
    retry: false,
  });
  const qr = useQuery({
    queryKey: ["zapi", "qr"],
    queryFn: () => zapiFetch<{ connected: boolean; image: string | null }>("/api/public/zapi/qr"),
    enabled: status.data?.configured === true && status.data?.connected === false,
    refetchInterval: (q) => (q.state.data?.connected ? false : 20000),
    retry: false,
  });
  const disconnect = useMutation({
    mutationFn: () => zapiFetch<{ ok: boolean }>("/api/public/zapi/disconnect"),
    onSuccess: () => { toast.success("WhatsApp desconectado"); qc.invalidateQueries({ queryKey: ["zapi"] }); },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const connected = status.data?.connected ?? false;

  return (
    <div className="mt-4 rounded-xl border bg-card/40 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Conexão WhatsApp</span>
        {connected ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
            <span className="size-2 rounded-full bg-emerald-500" /> Conectado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400">
            <span className="size-2 rounded-full bg-rose-500" /> Aguardando leitura
          </span>
        )}
      </div>

      {!connected && (
        <div className="flex flex-col items-center gap-3">
          <div className="size-56 rounded-2xl bg-white grid place-items-center p-3">
            {qr.isLoading ? (
              <RefreshCw className="size-6 animate-spin text-muted-foreground" />
            ) : qr.data?.image ? (
              <img src={qr.data.image} alt="QR Code WhatsApp" className="size-full object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground text-center px-2">
                <QrCode className="size-8" />
                <span className="text-xs">
                  {qr.error ? translateError(qr.error as Error) : status.error ? translateError(status.error as Error) : "Salve as credenciais e clique em atualizar"}
                </span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            Abra o WhatsApp → <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong> e escaneie.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 rounded-xl"
          onClick={() => qc.invalidateQueries({ queryKey: ["zapi"] })}
          disabled={status.isFetching || qr.isFetching}
        >
          <RefreshCw className={`size-4 mr-2 ${status.isFetching || qr.isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
        {connected && (
          <Button
            variant="outline"
            className="rounded-xl text-rose-400 border-rose-500/40 hover:bg-rose-500/10"
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
          >
            <LogOut className="size-4 mr-2" /> Desconectar
          </Button>
        )}
      </div>
    </div>
  );
}
