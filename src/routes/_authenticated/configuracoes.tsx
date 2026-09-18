import { createFileRoute } from "@tanstack/react-router";
import { translateError } from "@/lib/translate-error";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { User, KeyRound, Camera, Smartphone, Bell, Send } from "lucide-react";
import { Switch } from "@/components/ui/switch";

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
  title, description, icon: Icon, children, headerSlot,
}: { title: string; description?: string; icon: React.ElementType; color?: string; children: React.ReactNode; headerSlot?: React.ReactNode }) {
  return (
    <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md">
      <CardHeader className="flex flex-row items-start gap-3.5 space-y-0 pb-4">
        {headerSlot ?? (
          <div className="size-10 rounded-xl bg-zinc-800/70 border border-zinc-700/60 grid place-items-center shrink-0 text-zinc-200">
            <Icon className="size-5" />
          </div>
        )}
        <div className="min-w-0">
          <CardTitle className="text-base text-zinc-100">{title}</CardTitle>
          {description && <CardDescription className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{description}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
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
        .select("whatsapp_instance,support_message,subscription_expires_at,subscription_monthly_cents,app_android_url,app_ios_url,updates_movies_text,updates_series_text,updates_games_text,store_slug,store_title,store_description")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");

  const [supportMessage, setSupportMessage] = useState("");
  const [appAndroidUrl, setAppAndroidUrl] = useState("");
  const [appIosUrl, setAppIosUrl] = useState("");
  const [moviesText, setMoviesText] = useState("");
  const [seriesText, setSeriesText] = useState("");
  const [gamesText, setGamesText] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [storeTitle, setStoreTitle] = useState("");
  const [storeDescription, setStoreDescription] = useState("");
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
      setSupportMessage(settings.support_message ?? "");
      setAppAndroidUrl(settings.app_android_url ?? "");
      setAppIosUrl(settings.app_ios_url ?? "");
      setMoviesText(settings.updates_movies_text ?? "");
      setSeriesText(settings.updates_series_text ?? "");
      setGamesText((settings as { updates_games_text?: string | null }).updates_games_text ?? "");
      const s = settings as { store_slug?: string | null; store_title?: string | null; store_description?: string | null };
      setStoreSlug(s.store_slug ?? "");
      setStoreTitle(s.store_title ?? "");
      setStoreDescription(s.store_description ?? "");
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
    updates_movies_text: string | null;
    updates_series_text: string | null;
    updates_movies_updated_at: string | null;
    updates_series_updated_at: string | null;
    updates_games_text: string | null;
    store_slug: string | null;
    store_title: string | null;
    store_description: string | null;
    updates_games_updated_at: string | null;
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

  const { data: notifCfg } = useQuery({
    queryKey: ["notifications_config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications_config").select("*").eq("id", "global").maybeSingle();
      if (error) throw error;
      return (data ?? {
        notify_new_sale: true,
        notify_payment_approved: true,
        notify_renewal: true,
        notify_new_client: true,
        notify_trial: true,
        notify_payment_rejected: true,
      }) as Record<string, boolean | string>;
    },
  });

  const toggleNotif = useMutation({
    mutationFn: async (patch: Record<string, boolean>) => {
      const { error } = await supabase
        .from("notifications_config")
        .upsert({ id: "global", ...patch }, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications_config"] }),
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const testTelegram = useMutation({
    mutationFn: async () => {
      const { notifyEventFn } = await import("@/lib/notifications.functions");
      const r = await notifyEventFn({ data: {
        event: "new_sale",
        payload: { nome: "Teste", plano: "Mensagem de teste", valor: "0,00", metodo: "Telegram" },
      } });
      if (!r.ok) throw new Error(r.reason ?? "Falha");
    },
    onSuccess: () => toast.success("Mensagem de teste enviada"),
    onError: (e: Error) => toast.error(e.message),
  });

  const NOTIF_EVENTS: { key: string; label: string; desc: string }[] = [
    { key: "notify_new_sale", label: "Nova venda", desc: "Loja ou produto avulso aprovado" },
    { key: "notify_payment_approved", label: "Pagamento aprovado", desc: "Qualquer pagamento confirmado pelo Mercado Pago" },
    { key: "notify_renewal", label: "Renovação realizada", desc: "Cliente IPTV ou assinante renovou" },
    { key: "notify_new_client", label: "Novo cliente cadastrado", desc: "Cliente adicionado no painel" },
    { key: "notify_trial", label: "Teste gratuito criado", desc: "Novo assinante iniciou o trial de 7 dias" },
    { key: "notify_payment_rejected", label: "Pagamento recusado", desc: "Pagamento foi rejeitado ou cancelado" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Perfil, integrações e personalizações do painel" />

      <SectionCard
        title="Perfil"
        description="Dados que aparecem no painel e nos comprovantes"
        icon={User}
        headerSlot={
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Alterar foto de perfil"
            disabled={uploadAvatar.isPending}
            className="size-12 shrink-0 rounded-xl relative group overflow-hidden flex items-center justify-center bg-zinc-800/90 border border-zinc-700/80 hover:border-zinc-500 transition-colors cursor-pointer"
          >
            {avatarSigned ? (
              <img src={avatarSigned} alt="Foto de perfil" className="size-full object-cover" />
            ) : (
              <User className="size-6 text-zinc-400" />
            )}
            <span className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
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
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-300">Email</Label>
            <Input value={user?.email ?? ""} readOnly className="opacity-60 bg-zinc-950/70 border-zinc-800 text-zinc-100 rounded-lg text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-300">Nome de exibição</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-sm" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs text-zinc-300">Empresa</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-sm" />
          </div>
        </div>
        <div>
          <Button 
            className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium rounded-lg text-xs px-5 shadow-sm" 
            onClick={() => saveProfile.mutate()} 
            disabled={saveProfile.isPending}
          >
            Salvar Perfil
          </Button>
        </div>
      </SectionCard>

      <SectionCard 
        title="Loja pública (compradores sem IPTV)" 
        description="Define um link público para vender produtos da loja a clientes que não são assinantes do IPTV. Eles se cadastram com e-mail e senha." 
        icon={Smartphone}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-300">Slug da loja</Label>
            <Input
              placeholder="ex: ajp"
              value={storeSlug}
              onChange={(e) => setStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              className="bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-sm"
            />
            <p className="text-xs text-zinc-400">
              Link: <span className="font-mono text-zinc-300">{typeof window !== "undefined" ? window.location.origin : ""}/loja/{storeSlug || "seu-slug"}</span>
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-300">Título da loja</Label>
            <Input placeholder="Ex: Loja AJP" value={storeTitle} onChange={(e) => setStoreTitle(e.target.value)} className="bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-300">Descrição curta</Label>
            <Input placeholder="Ex: Streaming, contas premium, licenças..." value={storeDescription} onChange={(e) => setStoreDescription(e.target.value)} className="bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-sm" />
          </div>
          <div>
            <Button
              className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium rounded-lg text-xs px-5 shadow-sm"
              onClick={() => saveSettings.mutate({
                store_slug: storeSlug.trim() || null,
                store_title: storeTitle.trim() || null,
                store_description: storeDescription.trim() || null,
              })}
              disabled={saveSettings.isPending}
            >
              Salvar loja
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard 
        title="Atualizações" 
        description="Cole o texto completo das atualizações. Categorias entre parênteses, ex: *(LANÇAMENTO)*, *(AÇÃO)*, *(DRAMA)*. Os itens listados abaixo aparecem agrupados por categoria no portal." 
        icon={Smartphone}
      >
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-zinc-300">🎬 Filmes</Label>
            <Textarea
              rows={14}
              placeholder={"*FILMES ADICIONADOS*\n\n*(LANÇAMENTO)*\n1- Título do filme\n2- Outro filme [LEG]\n\n*(AÇÃO)*\n1- Título do filme"}
              value={moviesText}
              onChange={(e) => setMoviesText(e.target.value)}
              className="font-mono text-xs bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg"
            />
            <Button
              size="sm"
              className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium rounded-lg text-xs w-full shadow-sm"
              onClick={() => saveSettings.mutate({ updates_movies_text: moviesText, updates_movies_updated_at: new Date().toISOString() })}
              disabled={saveSettings.isPending}
            >
              Salvar Filmes
            </Button>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-zinc-300">📺 Séries</Label>
            <Textarea
              rows={14}
              placeholder={"*SÉRIES ADICIONADAS*\n\n*(LANÇAMENTO)*\n1- Nome da série S01\n\n*(DRAMA)*\n1- Nome da série S02"}
              value={seriesText}
              onChange={(e) => setSeriesText(e.target.value)}
              className="font-mono text-xs bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg"
            />
            <Button
              size="sm"
              className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium rounded-lg text-xs w-full shadow-sm"
              onClick={() => saveSettings.mutate({ updates_series_text: seriesText, updates_series_updated_at: new Date().toISOString() })}
              disabled={saveSettings.isPending}
            >
              Salvar Séries
            </Button>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-zinc-300">⚽ Jogos do Dia</Label>
            <Textarea
              rows={14}
              placeholder={"*JOGOS DO DIA*\n\n*(BRASILEIRÃO)*\n1- Flamengo x Palmeiras — 16h00\n2- Corinthians x São Paulo — 18h30\n\n*(CHAMPIONS)*\n1- Real Madrid x Bayern — 17h00"}
              value={gamesText}
              onChange={(e) => setGamesText(e.target.value)}
              className="font-mono text-xs bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg"
            />
            <Button
              size="sm"
              className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium rounded-lg text-xs w-full shadow-sm"
              onClick={() => saveSettings.mutate({ updates_games_text: gamesText, updates_games_updated_at: new Date().toISOString() })}
              disabled={saveSettings.isPending}
            >
              Salvar Jogos
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Central de Notificações"
        description="Escolha quais eventos você deseja receber no Telegram. Token e Chat ID ficam protegidos no servidor."
        icon={Bell}
      >
        <div className="space-y-2">
          {NOTIF_EVENTS.map((ev) => {
            const checked = (notifCfg?.[ev.key] as boolean | undefined) ?? true;
            return (
              <div key={ev.key} className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3.5 py-3 hover:border-zinc-700/80 transition-colors">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-zinc-200">{ev.label}</div>
                  <div className="text-xs text-zinc-400">{ev.desc}</div>
                </div>
                <Switch
                  checked={checked}
                  onCheckedChange={(v) => toggleNotif.mutate({ [ev.key]: v })}
                  disabled={toggleNotif.isPending}
                />
              </div>
            );
          })}
        </div>
        <Button
          variant="outline"
          className="rounded-lg border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 text-xs mt-2"
          onClick={() => testTelegram.mutate()}
          disabled={testTelegram.isPending}
        >
          <Send className="size-3.5 mr-2" />
          {testTelegram.isPending ? "Enviando..." : "Enviar mensagem de teste"}
        </Button>
      </SectionCard>

      <SectionCard title="Alterar senha" icon={KeyRound}>
        <div className="space-y-3 max-w-md">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-300">Senha atual</Label>
            <Input type="password" value={currentPass} onChange={(e) => setCurrentPass(e.target.value)} className="bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-300">Nova senha</Label>
            <Input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} className="bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-300">Confirmar nova senha</Label>
            <Input type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} className="bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-sm" />
          </div>
          <div>
            <Button className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium rounded-lg text-xs px-5 shadow-sm mt-1" onClick={() => changePassword.mutate()} disabled={changePassword.isPending}>
              Salvar senha
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function ContentUpdatesManager({ kind, title }: { kind: "movie" | "series"; title: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newImage, setNewImage] = useState("");

  const { data: items } = useQuery({
    queryKey: ["content_updates", user?.id, kind],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_updates")
        .select("id,title,description,image_url,created_at")
        .eq("kind", kind)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sem sessão");
      const t = newTitle.trim();
      if (!t) throw new Error("Informe o título");
      const { error } = await supabase.from("content_updates").insert({
        user_id: user.id,
        kind,
        title: t,
        description: newDesc.trim() || null,
        image_url: newImage.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewTitle(""); setNewDesc(""); setNewImage("");
      toast.success("Atualização adicionada");
      qc.invalidateQueries({ queryKey: ["content_updates"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("content_updates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["content_updates"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 space-y-3">
      <div className="font-medium text-sm text-zinc-200">{title}</div>
      <div className="space-y-2">
        <Input placeholder="Título (ex: Vingadores Ultimato)" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-sm" />
        <Input placeholder="URL da imagem (opcional)" value={newImage} onChange={(e) => setNewImage(e.target.value)} className="bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-sm" />
        <Textarea placeholder="Descrição (opcional)" rows={2} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-xs" />
        <Button size="sm" className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium rounded-lg text-xs w-full shadow-sm" onClick={() => add.mutate()} disabled={add.isPending}>
          Adicionar
        </Button>
      </div>
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {(items ?? []).length === 0 && (
          <div className="text-xs text-zinc-500 text-center py-3">Nenhuma atualização cadastrada</div>
        )}
        {(items ?? []).map((item) => (
          <div key={item.id} className="flex items-start gap-2.5 rounded-lg border border-zinc-800/80 bg-zinc-950/50 p-2.5">
            {item.image_url && (
              <img src={item.image_url} alt="" className="size-12 rounded-lg object-cover shrink-0 border border-zinc-800" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-zinc-200 truncate">{item.title}</div>
              {item.description && (
                <div className="text-xs text-zinc-400 line-clamp-2">{item.description}</div>
              )}
            </div>
            <Button size="sm" variant="ghost" className="text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 h-7 px-2 rounded-md" onClick={() => remove.mutate(item.id)}>
              Remover
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}


