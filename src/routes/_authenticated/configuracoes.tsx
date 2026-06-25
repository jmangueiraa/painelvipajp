import { createFileRoute } from "@tanstack/react-router";
import { translateError } from "@/lib/translate-error";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { User, MessageSquare, KeyRound, Camera, QrCode, RefreshCw, LogOut, Smartphone, Wallet } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";


export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Painel VIP" }] }),
  component: ConfiguracoesPage,
});

function SectionCard({
  title, description, icon: Icon, color, children, headerSlot,
}: { title: string; description?: string; icon: React.ElementType; color: string; children: React.ReactNode; headerSlot?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        {headerSlot ?? (
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
        )}
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function ConfiguracoesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("full_name,company_name,avatar_url").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [avatarSigned, setAvatarSigned] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!profile?.avatar_url) { setAvatarSigned(""); return; }
      const { data } = await supabase.storage.from("avatars").createSignedUrl(profile.avatar_url, 60 * 60);
      if (!cancelled) setAvatarSigned(data?.signedUrl ?? "");
    }
    load();
    return () => { cancelled = true; };
  }, [profile?.avatar_url]);

  const fileRef = useRef<HTMLInputElement>(null);
  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error("Sem sessão");
      if (!file.type.startsWith("image/")) throw new Error("Selecione uma imagem");
      if (file.size > 5 * 1024 * 1024) throw new Error("Imagem muito grande (máx 5MB)");
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      if (profile?.avatar_url) {
        await supabase.storage.from("avatars").remove([profile.avatar_url]).catch(() => {});
      }
      const { error } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Foto atualizada"); qc.invalidateQueries({ queryKey: ["profile"] }); },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const { data: settings } = useQuery({
    queryKey: ["settings", user?.id, "cfg"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("whatsapp_instance,support_message,subscription_expires_at,subscription_monthly_cents,app_android_url,app_ios_url,mp_access_token")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");

  const [mpAccessToken, setMpAccessToken] = useState("");
  const [showMpToken, setShowMpToken] = useState(false);
  const [supportMessage, setSupportMessage] = useState("");
  const [appAndroidUrl, setAppAndroidUrl] = useState("");
  const [appIosUrl, setAppIosUrl] = useState("");
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setCompanyName(profile.company_name ?? "");
    }
  }, [profile]);
  useEffect(() => {
    if (settings) {
      setMpAccessToken(settings.mp_access_token ?? "");
      setSupportMessage(settings.support_message ?? "");
      setAppAndroidUrl(settings.app_android_url ?? "");
      setAppIosUrl(settings.app_ios_url ?? "");
    }
  }, [settings]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sem sessão");
      const { error } = await supabase.from("profiles").update({ full_name: fullName, company_name: companyName }).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Perfil atualizado"); qc.invalidateQueries({ queryKey: ["profile"] }); },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  type SettingsPatch = Partial<{
    whatsapp_instance: string | null;
    pix_key: string | null;
    pix_name: string | null;
    pix_bank: string | null;
    pix_message: string | null;
    mp_access_token: string | null;
    support_message: string | null;
    subscription_expires_at: string | null;
    subscription_monthly_cents: number;
    app_android_url: string | null;
    app_ios_url: string | null;
  }>;
  const saveSettings = useMutation({
    mutationFn: async (patch: SettingsPatch) => {
      if (!user) throw new Error("Sem sessão");
      const { error } = await supabase.from("settings").update(patch).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Salvo"); qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      if (!user?.email) throw new Error("Sem sessão");
      if (!currentPass) throw new Error("Informe a senha atual");
      if (newPass.length < 6) throw new Error("A nova senha deve ter ao menos 6 caracteres");
      if (newPass !== confirmPass) throw new Error("A confirmação não confere");
      const { error: signErr } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPass });
      if (signErr) throw new Error("Senha atual incorreta");
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Senha alterada"); setCurrentPass(""); setNewPass(""); setConfirmPass(""); },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Perfil e integrações" />

      <SectionCard
        title="Perfil"
        description="Dados que aparecem no painel"
        icon={User}
        color="var(--kpi-violet)"
        headerSlot={
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Alterar foto de perfil"
            disabled={uploadAvatar.isPending}
            className="size-12 shrink-0 rounded-xl relative group overflow-hidden flex items-center justify-center shadow-[var(--shadow-glow)]"
            style={{ backgroundImage: avatarSigned ? undefined : "var(--gradient-primary)" }}
          >
            {avatarSigned ? (
              <img src={avatarSigned} alt="Foto de perfil" className="size-full object-cover" />
            ) : (
              <User className="size-6 text-primary-foreground" />
            )}
            <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="size-5 text-white" />
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAvatar.mutate(f);
                e.target.value = "";
              }}
            />
          </button>
        }
      >


        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} readOnly className="opacity-70" />
          </div>
          <div className="space-y-1">
            <Label>Nome de exibição</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Empresa</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
        </div>
        <Button className="btn-premium rounded-full mt-2" onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>Salvar</Button>
      </SectionCard>



      <SectionCard
        title="Mercado Pago"
        description="Configure seu Access Token para receber os pagamentos PIX diretamente na sua conta"
        icon={Wallet}
        color="var(--kpi-cyan)"
      >
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-sm text-cyan-100/90">
          Cole abaixo o <strong>Access Token de PRODUÇÃO</strong> da sua conta Mercado Pago (começa com <code>APP_USR-</code>).
          Você pode gerá-lo em <a href="https://www.mercadopago.com.br/developers/panel/app" target="_blank" rel="noreferrer" className="underline">Painel do desenvolvedor → Suas integrações → Credenciais de produção</a>.
          Todos os pagamentos PIX gerados pelos seus clientes serão creditados na sua conta.
        </div>
        <div className="space-y-1">
          <Label>Access Token do Mercado Pago</Label>
          <div className="flex gap-2">
            <Input
              type={showMpToken ? "text" : "password"}
              placeholder="APP_USR-xxxxxxxx-xxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxxx"
              value={mpAccessToken}
              onChange={(e) => setMpAccessToken(e.target.value)}
              autoComplete="off"
            />
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setShowMpToken((v) => !v)}>
              {showMpToken ? "Ocultar" : "Mostrar"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            O token é armazenado com segurança e usado somente para criar e consultar pagamentos PIX dos seus clientes.
          </p>
        </div>
        <Button
          className="btn-premium rounded-full"
          onClick={() => saveSettings.mutate({ mp_access_token: mpAccessToken.trim() || null })}
          disabled={saveSettings.isPending}
        >
          Salvar Access Token
        </Button>
      </SectionCard>


      <SectionCard title="Atualizações" description="Cadastre as atualizações de Filmes e Séries que aparecerão no portal do cliente" icon={Smartphone} color="var(--kpi-violet)">
        <div className="grid md:grid-cols-2 gap-4">
          <ContentUpdatesManager kind="movie" title="Filmes" />
          <ContentUpdatesManager kind="series" title="Séries" />
        </div>
      </SectionCard>




      <SectionCard title="Alterar senha" icon={KeyRound} color="var(--kpi-violet)">
        <div className="space-y-1">
          <Label>Senha atual</Label>
          <Input type="password" value={currentPass} onChange={(e) => setCurrentPass(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Nova senha</Label>
          <Input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Confirmar nova senha</Label>
          <Input type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} />
        </div>
        <Button className="btn-premium rounded-full" onClick={() => changePassword.mutate()} disabled={changePassword.isPending}>Salvar senha</Button>
      </SectionCard>
    </div>
  );
}

function WhatsAppConnectSection() {
  const qc = useQueryClient();

  async function zapiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessão expirada. Entre novamente.");

    const res = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Falha na integração WhatsApp (HTTP ${res.status})`);
    return body as T;
  }

  const status = useQuery({
    queryKey: ["zapi", "status"],
    queryFn: () => zapiFetch<{ configured: boolean; connected: boolean; raw?: unknown }>("/api/public/zapi/status", { method: "POST" }),
    refetchInterval: 8000,
  });

  const qr = useQuery({
    queryKey: ["zapi", "qr"],
    queryFn: () => zapiFetch<{ connected: boolean; image: string | null }>("/api/public/zapi/qr", { method: "POST" }),
    enabled: status.data?.configured === true && status.data?.connected === false,
    refetchInterval: (q) => (q.state.data?.connected ? false : 20000),
  });

  const disconnect = useMutation({
    mutationFn: () => zapiFetch<{ ok: boolean }>("/api/public/zapi/disconnect", { method: "POST" }),
    onSuccess: () => {
      toast.success("WhatsApp desconectado");
      qc.invalidateQueries({ queryKey: ["zapi"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const configured = status.data?.configured ?? true;
  const connected = status.data?.connected ?? false;

  return (
    <SectionCard
      title="Conectar WhatsApp"
      description="Escaneie o QR Code com seu WhatsApp para enviar cobranças automáticas via Z-API."
      icon={MessageSquare}
      color="var(--kpi-emerald)"
    >
      <div className="flex items-center justify-between -mt-2">
        <span className="text-xs text-muted-foreground">Integração: Z-API</span>
        {connected ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
            <span className="size-2 rounded-full bg-emerald-500" /> Conectado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400">
            <span className="size-2 rounded-full bg-rose-500" /> {configured ? "Aguardando leitura" : "Não configurado"}
          </span>
        )}
      </div>

      {!configured && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-300">
          Credenciais Z-API ausentes. Configure os secrets <strong>Z_API_INSTANCE_ID</strong>, <strong>Z_API_TOKEN</strong> e (opcional) <strong>Z_API_CLIENT_TOKEN</strong>.
        </div>
      )}

      {configured && connected && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-300">
          ✅ WhatsApp conectado e pronto para enviar cobranças automáticas.
        </div>
      )}

      {configured && !connected && (
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="size-64 rounded-2xl bg-white grid place-items-center p-3 shadow-[var(--shadow-glow)]">
            {qr.isLoading ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <RefreshCw className="size-6 animate-spin" />
                <span className="text-xs">Gerando QR Code…</span>
              </div>
            ) : qr.data?.image ? (
              <img src={qr.data.image} alt="QR Code WhatsApp" className="size-full object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground text-center px-2">
                <QrCode className="size-8" />
                <span className="text-xs">{qr.error ? translateError(qr.error as Error) : "Clique em atualizar"}</span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            Abra o WhatsApp no celular → <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong> e escaneie.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 rounded-xl h-11"
          onClick={() => { qc.invalidateQueries({ queryKey: ["zapi"] }); }}
          disabled={status.isFetching || qr.isFetching}
        >
          <RefreshCw className={`size-4 mr-2 ${status.isFetching || qr.isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
        {connected && (
          <Button
            variant="outline"
            className="rounded-xl h-11 text-rose-400 border-rose-500/40 hover:bg-rose-500/10"
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
          >
            <LogOut className="size-4 mr-2" /> Desconectar
          </Button>
        )}
      </div>
    </SectionCard>
  );
}

