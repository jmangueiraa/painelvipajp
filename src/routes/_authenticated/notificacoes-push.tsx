import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, Send, Clock, CheckCircle2, XCircle, Users, UserCheck, UserX, ListChecks } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { translateError } from "@/lib/translate-error";
import {
  sendPushNotification,
  listPushHistory,
  cancelScheduledPush,
  listClientsForPush,
} from "@/lib/push-admin.functions";

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
  const send = useServerFn(sendPushNotification);
  const cancel = useServerFn(cancelScheduledPush);
  const history = useServerFn(listPushHistory);
  const clientsFn = useServerFn(listClientsForPush);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/portal/painel");
  const [audience, setAudience] = useState<Audience>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [clientFilter, setClientFilter] = useState("");

  const { data: hist = [] } = useQuery({ queryKey: ["push-history"], queryFn: () => history() });
  const { data: clients = [] } = useQuery({ queryKey: ["push-clients"], queryFn: () => clientsFn(), enabled: audience === "specific" });

  const sendMut = useMutation({
    mutationFn: async () =>
      send({
        data: {
          title: title.trim(),
          body: body.trim(),
          url: url.trim() || null,
          audience,
          clientIds: audience === "specific" ? selectedIds : [],
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        },
      }),
    onSuccess: (res: any) => {
      if (res?.scheduled) toast.success(`Notificação agendada (${res.targets} clientes)`);
      else toast.success(`Enviada: ${res?.success ?? 0} entregues, ${res?.failure ?? 0} falhas (${res?.tokens ?? 0} dispositivos)`);
      setTitle(""); setBody(""); setScheduledAt(""); setSelectedIds([]);
      qc.invalidateQueries({ queryKey: ["push-history"] });
    },
    onError: (e) => toast.error(translateError(e)),
  });

  const cancelMut = useMutation({
    mutationFn: async (id: string) => cancel({ data: { id } }),
    onSuccess: () => { toast.success("Agendamento cancelado"); qc.invalidateQueries({ queryKey: ["push-history"] }); },
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
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Bell className="w-6 h-6 text-primary" /></div>
          <div>
            <h1 className="text-2xl font-bold">Notificações Push</h1>
            <p className="text-sm text-muted-foreground">Envie avisos para os PWAs dos clientes via Firebase Cloud Messaging</p>
          </div>
        </div>

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
                <div className="text-xs text-muted-foreground text-right">{body.length}/500</div>
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
                      <label key={opt.value} htmlFor={`aud-${opt.value}`} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${audience === opt.value ? "border-primary bg-primary/5" : "border-border"}`}>
                        <RadioGroupItem value={opt.value} id={`aud-${opt.value}`} className="mt-1" />
                        <Icon className="w-4 h-4 mt-0.5 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="font-medium text-sm">{opt.label}</div>
                          <div className="text-xs text-muted-foreground">{opt.desc}</div>
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
                  <ScrollArea className="h-56 rounded-lg border p-2">
                    <div className="space-y-1">
                      {filteredClients.map((c: any) => {
                        const checked = selectedIds.includes(c.id);
                        return (
                          <label key={c.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
                            <Checkbox checked={checked} onCheckedChange={(v) => {
                              setSelectedIds((prev) => v ? [...prev, c.id] : prev.filter((x) => x !== c.id));
                            }} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm truncate">{c.name}</div>
                              <div className="text-xs text-muted-foreground truncate">{c.iptv_login || "-"} · vence {c.due_date}</div>
                            </div>
                          </label>
                        );
                      })}
                      {filteredClients.length === 0 && <div className="text-sm text-muted-foreground p-3 text-center">Nenhum cliente</div>}
                    </div>
                  </ScrollArea>
                </div>
              )}

              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Clock className="w-4 h-4" /> Agendar (opcional)</Label>
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                <div className="text-xs text-muted-foreground">Deixe em branco para enviar agora</div>
              </div>

              <Button onClick={() => sendMut.mutate()} disabled={!canSend} className="w-full" size="lg">
                <Send className="w-4 h-4 mr-2" />
                {sendMut.isPending ? "Enviando..." : scheduledAt ? "Agendar envio" : "Enviar agora"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sobre</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-3">
              <p>Os clientes precisam ter aberto o portal e <strong>autorizado notificações</strong> para receber. iOS exige o PWA instalado na tela de início.</p>
              <div className="p-3 bg-muted rounded-lg text-xs space-y-1">
                <div>📱 Dispositivos registrados: veja abaixo em cada envio</div>
                <div>🔔 Provider: Firebase Cloud Messaging</div>
                <div>🎯 Projeto: ajpnot</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Histórico</CardTitle>
            <CardDescription>Últimas 50 notificações</CardDescription>
          </CardHeader>
          <CardContent>
            {hist.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">Nenhum envio ainda</div>
            ) : (
              <div className="space-y-2">
                {hist.map((h: any) => (
                  <div key={h.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-medium">{h.title}</div>
                        {h.status === "sent" && <Badge variant="secondary" className="gap-1"><CheckCircle2 className="w-3 h-3" /> Enviada</Badge>}
                        {h.status === "scheduled" && <Badge className="gap-1 bg-blue-500"><Clock className="w-3 h-3" /> Agendada</Badge>}
                        {h.status === "failed" && <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Falhou</Badge>}
                        {h.status === "cancelled" && <Badge variant="outline">Cancelada</Badge>}
                      </div>
                      <div className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{h.body}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {h.audience} · {h.status === "scheduled" ? `agendada para ${fmt(h.scheduled_at)}` : fmt(h.sent_at || h.created_at)}
                        {h.status === "sent" && ` · ${h.success_count} entregues / ${h.failure_count} falhas`}
                        {h.error && ` · erro: ${h.error}`}
                      </div>
                    </div>
                    {h.status === "scheduled" && (
                      <Button size="sm" variant="ghost" onClick={() => cancelMut.mutate(h.id)}>Cancelar</Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
