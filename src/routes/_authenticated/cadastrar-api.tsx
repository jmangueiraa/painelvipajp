import { createFileRoute } from "@tanstack/react-router";
import { evolutionAction } from "@/lib/evolution.functions";
import { normalizeEvolutionUrl } from "@/lib/evolution-api";
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
  head: () => ({ meta: [
    { title: "API e Integrações — AJP VIP" },
    { name: "description", content: "Configure Mercado Pago, Telegram e WhatsApp Evolution API no painel AJP VIP." },
    { property: "og:title", content: "API e Integrações — AJP VIP" },
    { property: "og:description", content: "Gerencie suas conexões e alertas de pagamento no AJP VIP." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: CadastrarApiPage,
});

type Settings = {
  mp_access_token: string | null;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;

};

function SectionCard({
  title, description, icon: Icon, children,
}: { title: string; description?: string; icon: React.ElementType; color?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div className="size-9 rounded-lg grid place-items-center bg-zinc-800/60 border border-zinc-700/50 text-zinc-300 shrink-0">
          <Icon className="size-4.5" />
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
        .select("mp_access_token,telegram_bot_token,telegram_chat_id")
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

  }, [settings]);

  const evolutionSettings = useQuery({ queryKey: ["evolution", "settings"], queryFn: () => evolutionAction({ data: { action: "settings" } }), retry: false });
  useEffect(() => {
    const value = evolutionSettings.data;
    if (value && "base_url" in value) { setZCli(value.base_url); setZInst(value.instance_name); }
  }, [evolutionSettings.data]);
  const saveEvolution = useMutation({
    mutationFn: () => evolutionAction({ data: { action: "save", base_url: normalizeEvolutionUrl(zCli), instance_name: zInst, api_key: zTok } }),
    onSuccess: () => { setZTok(""); toast.success("Evolution API salva"); void qc.invalidateQueries({ queryKey: ["evolution"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

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
            <Button type="button" variant="outline" onClick={() => setShowMp((v) => !v)}>
              {showMp ? "Ocultar" : "Mostrar"}
            </Button>
          </div>
          <p className="text-xs text-zinc-400">
            Gere em <a className="underline hover:text-zinc-200" target="_blank" rel="noreferrer" href="https://www.mercadopago.com.br/developers/panel/app">Painel do desenvolvedor → Credenciais de produção</a>.
          </p>
        </div>
        <Button
          className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium"
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
      >
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-sm text-zinc-300">
          1) Crie um bot em <a className="underline hover:text-zinc-100" target="_blank" rel="noreferrer" href="https://t.me/BotFather">@BotFather</a> para obter o <strong>Bot Token</strong>.<br />
          2) Inicie uma conversa com o seu bot e descubra seu <strong>Chat ID</strong> em <a className="underline hover:text-zinc-100" target="_blank" rel="noreferrer" href="https://t.me/userinfobot">@userinfobot</a>.
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
            <Button type="button" variant="outline" onClick={() => setShowTg((v) => !v)}>
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
            className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium"
            onClick={() => save.mutate({ telegram_bot_token: tgToken.trim() || null, telegram_chat_id: tgChat.trim() || null })}
            disabled={save.isPending}
          >
            Salvar Telegram
          </Button>
          <Button
            variant="outline"
            onClick={() => testTelegram.mutate()}
            disabled={testTelegram.isPending}
          >
            <Send className="size-4 mr-2" />
            {testTelegram.isPending ? "Enviando..." : "Enviar mensagem de teste"}
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="WhatsApp (Evolution API)"
        description="Conecte seu WhatsApp via Evolution API para envio automático de cobranças."
        icon={MessageSquare}
      >
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="admin-evolution-url">URL Base da API</Label>
            <Input id="admin-evolution-url" type="url" placeholder="https://api.seudominio.com.br" value={zCli} onChange={(e) => setZCli(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="admin-evolution-instance">Nome da Instância</Label>
            <Input id="admin-evolution-instance" placeholder="ajpvip" value={zInst} onChange={(e) => setZInst(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="admin-evolution-key">Chave de API</Label>
            <div className="flex gap-2">
              <Input id="admin-evolution-key" type={showZ ? "text" : "password"} placeholder="API Key — vazio mantém a chave salva" value={zTok} onChange={(e) => setZTok(e.target.value)} autoComplete="new-password" />
              <Button type="button" variant="outline" onClick={() => setShowZ((v) => !v)}>{showZ ? "Ocultar" : "Mostrar"}</Button>
            </div>
          </div>
        </div>
        <Button onClick={() => saveEvolution.mutate()} disabled={saveEvolution.isPending}>Salvar WhatsApp</Button>
        {evolutionSettings.error && <p className="text-xs text-destructive" role="alert">{evolutionSettings.error.message}</p>}

        <WhatsAppConnectBlock />
      </SectionCard>
    </div>
  );
}

function WhatsAppConnectBlock() {
  const qc = useQueryClient();

  async function evolutionFetch<T>(action: "status" | "qr" | "disconnect"): Promise<T> {
    return await evolutionAction({ data: { action } }) as T;
  }

  const status = useQuery({
    queryKey: ["evolution", "status"],
    queryFn: () => evolutionFetch<{ configured: boolean; connected: boolean }>("status"),
    refetchInterval: 8000,
    retry: false,
  });
  const qr = useQuery({
    queryKey: ["evolution", "qr"],
    queryFn: () => evolutionFetch<{ connected: boolean; image: string | null }>("qr"),
    enabled: status.data?.configured === true && status.data?.connected === false,
    refetchInterval: (q) => (q.state.data?.connected ? false : 20000),
    retry: false,
  });
  const disconnect = useMutation({
    mutationFn: () => evolutionFetch<{ ok: boolean }>("disconnect"),
    onSuccess: () => { toast.success("WhatsApp desconectado"); qc.invalidateQueries({ queryKey: ["evolution"] }); },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const connected = status.data?.connected ?? false;

  return (
    <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-200">Conexão WhatsApp</span>
        {connected ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="size-1.5 rounded-full bg-emerald-400" /> Conectado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="size-1.5 rounded-full bg-amber-400" /> Desconectado
          </span>
        )}
      </div>

      {!connected && (
        <div className="flex flex-col items-center gap-3">
          <div className="size-56 rounded-xl bg-white grid place-items-center p-3 border border-zinc-700">
            {qr.isLoading ? (
              <RefreshCw className="size-6 animate-spin text-zinc-500" />
            ) : qr.data?.image ? (
              <img src={qr.data.image} alt="QR Code WhatsApp" className="size-full object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-zinc-500 text-center px-2">
                <QrCode className="size-8" />
                <span className="text-xs">
                  {qr.error ? translateError(qr.error as Error) : status.error ? translateError(status.error as Error) : "Salve as credenciais e clique em atualizar"}
                </span>
              </div>
            )}
          </div>
          <p className="text-xs text-zinc-400 text-center max-w-xs">
            Abra o WhatsApp → <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong> e escaneie.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => qc.invalidateQueries({ queryKey: ["evolution"] })}
          disabled={status.isFetching || qr.isFetching}
        >
          <RefreshCw className={`size-4 mr-2 ${status.isFetching || qr.isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
        {connected && (
          <Button
            variant="outline"
            className="text-rose-400 border-rose-500/40 hover:bg-rose-500/10"
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
