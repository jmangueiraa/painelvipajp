import { createFileRoute } from "@tanstack/react-router";
import { translateError } from "@/lib/translate-error";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { User, MessageSquare, KeyRound, LifeBuoy, Camera, QrCode, RefreshCw, LogOut } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { parseBrlToCents } from "@/lib/format";
import { getZapiStatus, getZapiQrCode, disconnectZapi } from "@/lib/zapi-status.functions";

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
        .select("whatsapp_instance,pix_key,pix_name,pix_bank,pix_message,support_message,subscription_expires_at,subscription_monthly_cents")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [whatsappInstance, setWhatsappInstance] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [pixName, setPixName] = useState("");
  const [pixBank, setPixBank] = useState("");
  const [pixMessage, setPixMessage] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [subExpires, setSubExpires] = useState("");
  const [subMonthly, setSubMonthly] = useState("");
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
      setWhatsappInstance(settings.whatsapp_instance ?? "");
      setPixKey(settings.pix_key ?? "");
      setPixName(settings.pix_name ?? "");
      setPixBank(settings.pix_bank ?? "");
      setPixMessage(settings.pix_message ?? "");
      setSupportMessage(settings.support_message ?? "");
      setSubExpires(settings.subscription_expires_at ?? "");
      setSubMonthly(((settings.subscription_monthly_cents ?? 0) / 100).toFixed(2).replace(".", ","));
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
    support_message: string | null;
    subscription_expires_at: string | null;
    subscription_monthly_cents: number;
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
        title="Conectar WhatsApp"
        description="Conecte sua conta do WhatsApp para enviar cobranças automáticas aos seus clientes."
        icon={MessageSquare}
        color="var(--kpi-emerald)"
      >
        <div className="flex items-center justify-end -mt-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400">
            <span className="size-2 rounded-full bg-rose-500" /> Offline
          </span>
        </div>
        <Button
          className="w-full rounded-xl h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
          onClick={() => toast.info("Em breve: integração Evolution. Adicione EVOLUTION_API_URL e EVOLUTION_API_KEY nos secrets.")}
        >
          <MessageSquare className="size-4 mr-2" /> Conectar WhatsApp
        </Button>

        <div className="h-px bg-border my-2" />

        <div className="space-y-1">
          <Label className="text-sm font-semibold">Conectar via Evolution (instância existente)</Label>
          <p className="text-xs text-muted-foreground">
            Já tem uma instância criada na Evolution? Digite o nome exato dela para vincular e gerar o QR Code.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="nome-da-instancia"
            value={whatsappInstance}
            onChange={(e) => setWhatsappInstance(e.target.value)}
            className="h-11"
          />
          <Button
            className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shrink-0 px-4"
            onClick={() => {
              if (!whatsappInstance.trim()) {
                toast.error("Informe o nome da instância");
                return;
              }
              saveSettings.mutate({ whatsapp_instance: whatsappInstance.trim() });
            }}
          >
            Vincular &<br />gerar QR
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Cadastrar PIX" description="Dados que serão usados nas cobranças" icon={KeyRound} color="var(--kpi-cyan)">
        <div className="grid md:grid-cols-3 gap-3">
          <div className="space-y-1"><Label>Chave PIX</Label><Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} /></div>
          <div className="space-y-1"><Label>Nome</Label><Input value={pixName} onChange={(e) => setPixName(e.target.value)} /></div>
          <div className="space-y-1"><Label>Banco</Label><Input value={pixBank} onChange={(e) => setPixBank(e.target.value)} /></div>
        </div>
        <div className="space-y-1">
          <Label>Mensagem PIX</Label>
          <Textarea rows={3} placeholder="Após o pagamento envie o comprovante." value={pixMessage} onChange={(e) => setPixMessage(e.target.value)} />
        </div>
        <Button className="btn-premium rounded-full" onClick={() => saveSettings.mutate({ pix_key: pixKey, pix_name: pixName, pix_bank: pixBank, pix_message: pixMessage })}>
          Salvar mensagem PIX
        </Button>
      </SectionCard>

      <SectionCard title="Mensagem padrão de suporte" description="Enviada quando você clica em 'Mensagem de suporte' na lista de clientes" icon={LifeBuoy} color="var(--kpi-amber)">
        <Textarea rows={3} placeholder="Olá! Aqui é o suporte. Como posso te ajudar?" value={supportMessage} onChange={(e) => setSupportMessage(e.target.value)} />
        <Button className="btn-premium rounded-full" onClick={() => saveSettings.mutate({ support_message: supportMessage })}>Salvar mensagem de suporte</Button>
      </SectionCard>

      <SectionCard title="Assinatura do painel" description="Usado em Dashboard e Renovação" icon={KeyRound} color="var(--kpi-violet)">
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Expira em</Label><Input type="date" value={subExpires} onChange={(e) => setSubExpires(e.target.value)} /></div>
          <div className="space-y-1"><Label>Valor mensal (R$)</Label><Input inputMode="decimal" value={subMonthly} onChange={(e) => setSubMonthly(e.target.value)} /></div>
        </div>
        <Button className="btn-premium rounded-full" onClick={() => saveSettings.mutate({ subscription_expires_at: subExpires || null, subscription_monthly_cents: parseBrlToCents(subMonthly) })}>
          Salvar assinatura
        </Button>
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
