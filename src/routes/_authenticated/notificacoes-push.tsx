import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, Send, Clock, CheckCircle2, XCircle, Users, UserCheck, UserX, ListChecks, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { translateError } from "@/lib/translate-error";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/notificacoes-push")({
  head: () => ({ meta: [{ title: "Notificações Push" }] }),
  component: NotificacoesPushPage,
});

type Audience = "all" | "active" | "expired" | "specific";

function fmt(dt: string | null) {
  if (!dt) return "-";
  const d = new Date(dt);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function NotificacoesPushPage() {
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/portal/painel");
  const [audience, setAudience] = useState<Audience>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [clientFilter, setClientFilter] = useState("");

  const { data: hist = [] } = useQuery({
    queryKey: ["push-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("push_notifications_log")
        .select("id, title, body, audience, url, status, success_count, failure_count, sent_at, scheduled_at, created_at, error")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });
  const { data: clients = [] } = useQuery({
    queryKey: ["push-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, iptv_login, due_date")
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: audience === "specific",
  });

  async function getTargetClientIds(): Promise<string[]> {
    if (audience === "specific") return selectedIds;
    const today = new Date().toISOString().slice(0, 10);
    let query = supabase.from("clients").select("id");
    if (audience === "active") query = query.gte("due_date", today);
    if (audience === "expired") query = query.lt("due_date", today);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((client) => client.id);
  }

  const sendMut = useMutation({
    mutationFn: async () => {
      // Qualquer data preenchida = agendamento (insert direto, o cron processa).
      // Sem data = envio imediato via server function.
      if (scheduledAt) {
        const clientIds = await getTargetClientIds();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) throw authError || new Error("Sessão expirada. Entre novamente.");
        const when = new Date(scheduledAt);
        const scheduleIso = when.getTime() > Date.now() ? when.toISOString() : new Date().toISOString();
        const { data: row, error } = await supabase
          .from("push_notifications_log")
          .insert({
            user_id: authData.user.id,
            title: title.trim(),
            body: body.trim(),
            url: url.trim() || null,
            audience,
            target_client_ids: clientIds,
            scheduled_at: scheduleIso,
            status: "scheduled",
          })
          .select("id")
          .single();
        if (error) throw error;
        return { scheduled: true, id: row.id, targets: clientIds.length };
      }
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (sessionError || !accessToken) throw sessionError || new Error("Sessão expirada. Entre novamente.");
      const isCustomDomain =
        typeof window !== "undefined" &&
        (window.location.hostname === "ajpvip.com.br" ||
          window.location.hostname === "www.ajpvip.com.br" ||
          window.location.hostname === "portal.ajpstore.com.br" ||
          window.location.hostname === "ajpstore.com.br" ||
          window.location.hostname === "www.ajpstore.com.br" ||
          window.location.hostname === "portalajp.com.br" ||
          window.location.hostname === "www.portalajp.com.br");
      const endpoint = isCustomDomain ? "https://painelvipajp.lovable.app/api/public/push/send" : "/api/public/push/send";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          url: url.trim() || null,
          audience,
          clientIds: audience === "specific" ? selectedIds : [],
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível enviar a notificação.");
      return result;
    },
    onSuccess: (res: any) => {
      if (res?.scheduled) toast.success(`Notificação agendada (${res.targets} clientes)`);
      else toast.success(`Enviada: ${res?.success ?? 0} entregues, ${res?.failure ?? 0} falhas (${res?.tokens ?? 0} dispositivos)`);
      setTitle(""); setBody(""); setScheduledAt(""); setSelectedIds([]);
      qc.invalidateQueries({ queryKey: ["push-history"] });
    },
    onError: (e) => toast.error(translateError(e)),
  });

  const cancelMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("push_notifications_log")
        .update({ status: "cancelled" })
        .eq("id", id)
        .eq("status", "scheduled");
      if (error) throw error;
      return { ok: true };
    },
    onSuccess: () => { toast.success("Agendamento cancelado"); qc.invalidateQueries({ queryKey: ["push-history"] }); },
    onError: (e) => toast.error(translateError(e)),
  });

  const clearMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("push_notifications_log")
        .delete()
        .neq("status", "scheduled");
      if (error) throw error;
      return { ok: true };
    },
    onSuccess: () => { toast.success("Histórico limpo"); qc.invalidateQueries({ queryKey: ["push-history"] }); },
    onError: (e) => toast.error(translateError(e)),
  });

  const filteredClients = clients.filter((c: any) =>
    !clientFilter.trim() ||
    `${c.name} ${c.iptv_login ?? ""}`.toLowerCase().includes(clientFilter.toLowerCase()),
  );

  const audienceOptions: { value: Audience; label: string; icon: any; desc: string }[] = [
    { value: "all", label: "Todos os clientes", icon: Users, desc: "Todos cadastrados" },
    { value: "active", label: "Clientes ativos", icon: UserCheck, desc: "Dentro do vencimento" },
    { value: "expired", label: "Clientes vencidos", icon: UserX, desc: "Com plano expirado" },
    { value: "specific", label: "Selecionar clientes", icon: ListChecks, desc: "Escolher manualmente" },
  ];

  const canSend = title.trim().length > 0 && body.trim().length > 0 && (audience !== "specific" || selectedIds.length > 0) && !sendMut.isPending;

  return (
    <div className="space-y-6">
      <PageHeader title="Notificações Push" description="Envie avisos para os PWAs dos clientes via Firebase Cloud Messaging" />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Nova notificação</CardTitle>
            <CardDescription>A mensagem chega mesmo com o PWA fechado (para quem permitiu notificações)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Novidades no sistema" maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escreva o texto que o cliente verá..." rows={4} maxLength={500} />
              <div className="text-xs text-zinc-500 text-right">{body.length}/500</div>
            </div>
            <div className="space-y-2">
              <Label>Link ao tocar (opcional)</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/portal/painel" />
            </div>

            <div className="space-y-2">
              <Label>Público</Label>
              <RadioGroup value={audience} onValueChange={(v) => setAudience(v as Audience)} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {audienceOptions.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <label key={opt.value} htmlFor={`aud-${opt.value}`} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${audience === opt.value ? "border-zinc-500 bg-zinc-800/50" : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/40"}`}>
                      <RadioGroupItem value={opt.value} id={`aud-${opt.value}`} className="mt-1" />
                      <Icon className="w-4 h-4 mt-0.5 text-zinc-400" />
                      <div className="flex-1">
                        <div className="font-medium text-sm text-zinc-100">{opt.label}</div>
                        <div className="text-xs text-zinc-400">{opt.desc}</div>
                      </div>
                    </label>
                  );
                })}
              </RadioGroup>
            </div>

            {audience === "specific" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Selecionar clientes ({selectedIds.length})</Label>
                  <Input value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} placeholder="Buscar..." className="max-w-[200px] h-8" />
                </div>
                <ScrollArea className="h-56 rounded-lg border border-zinc-800 p-2 bg-zinc-950/40">
                  <div className="space-y-1">
                    {filteredClients.map((c: any) => {
                      const checked = selectedIds.includes(c.id);
                      return (
                        <label key={c.id} className="flex items-center gap-2 p-2 rounded hover:bg-zinc-800/50 cursor-pointer">
                          <Checkbox checked={checked} onCheckedChange={(v) => {
                            setSelectedIds((prev) => v ? [...prev, c.id] : prev.filter((x) => x !== c.id));
                          }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-zinc-100 truncate">{c.name}</div>
                            <div className="text-xs text-zinc-400 truncate">{c.iptv_login || "-"} · vence {c.due_date}</div>
                          </div>
                        </label>
                      );
                    })}
                    {filteredClients.length === 0 && <div className="text-sm text-zinc-500 p-3 text-center">Nenhum cliente</div>}
                  </div>
                </ScrollArea>
              </div>
            )}

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-zinc-200"><Clock className="w-4 h-4 text-zinc-400" /> Agendar (opcional)</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              <div className="text-xs text-zinc-500">Deixe em branco para enviar agora</div>
            </div>

            <Button onClick={() => sendMut.mutate()} disabled={!canSend} className="w-full bg-white text-zinc-950 hover:bg-zinc-200 font-medium" size="lg">
              <Send className="w-4 h-4 mr-2" />
              {sendMut.isPending ? "Enviando..." : scheduledAt ? "Agendar envio" : "Enviar agora"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sobre</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-zinc-400 space-y-3">
            <p>Os clientes precisam ter aberto o portal e <strong>autorizado notificações</strong> para receber. iOS exige o PWA instalado na tela de início.</p>
            <div className="p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-lg text-xs space-y-1 text-zinc-400">
              <div>📱 Dispositivos registrados: veja abaixo em cada envio</div>
              <div>🔔 Provider: Firebase Cloud Messaging</div>
              <div>🎯 Projeto: ajpnot</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Histórico</CardTitle>
            <CardDescription>Últimas 50 notificações</CardDescription>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={hist.length === 0 || clearMut.isPending}>
                <Trash2 className="w-4 h-4 mr-2" />
                Limpar histórico
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Limpar histórico?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso remove todas as notificações enviadas, falhas e canceladas. Agendamentos pendentes serão mantidos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => clearMut.mutate()}>Limpar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardHeader>
        <CardContent>
          {hist.length === 0 ? (
            <div className="text-sm text-zinc-500 text-center py-8">Nenhum envio ainda</div>
          ) : (
            <div className="space-y-2">
              {hist.map((h: any) => (
                <div key={h.id} className="flex items-start justify-between gap-3 p-3.5 rounded-lg border border-zinc-800/80 bg-zinc-900/40">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium text-zinc-100">{h.title}</div>
                      {h.status === "sent" && <Badge variant="emerald" className="gap-1"><CheckCircle2 className="w-3 h-3" /> Enviada</Badge>}
                      {h.status === "scheduled" && <Badge variant="sky" className="gap-1"><Clock className="w-3 h-3" /> Agendada</Badge>}
                      {h.status === "failed" && <Badge variant="rose" className="gap-1"><XCircle className="w-3 h-3" /> Falhou</Badge>}
                      {h.status === "cancelled" && <Badge variant="neutral">Cancelada</Badge>}
                    </div>
                    <div className="text-sm text-zinc-300 line-clamp-2 mt-1">{h.body}</div>
                    <div className="text-xs text-zinc-500 mt-1">
                      {h.audience} · {h.status === "scheduled" ? `agendada para ${fmt(h.scheduled_at)}` : fmt(h.sent_at || h.created_at)}
                      {h.status === "sent" && ` · ${h.success_count} entregues / ${h.failure_count} falhas`}
                      {h.error && ` · erro: ${h.error}`}
                    </div>
                  </div>
                  {h.status === "scheduled" && (
                    <Button size="sm" variant="ghost" className="text-zinc-400 hover:text-rose-400" onClick={() => cancelMut.mutate(h.id)}>Cancelar</Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
