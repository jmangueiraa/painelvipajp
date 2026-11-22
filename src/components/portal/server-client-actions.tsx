import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Copy, FileText, Loader2, MessageCircle, Pencil, Power, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { portalFetch } from "@/lib/portal-client";
import { serverClientEnabled, type ServerClientAction } from "@/lib/server-client-actions";
import type { NormalizedServerClient, NormalizedServerPlan } from "@/lib/iptv-server-api";

type Mode = "extend" | "message" | "plan" | "notes" | "status" | "delete";
async function post<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const result = await portalFetch<T & { ok?: boolean; error?: string }>("/api/public/portal/admin", {
    method: "POST", body: JSON.stringify({ action, ...payload }),
  });
  if (result?.ok === false || result?.error) throw new Error(result.error || "Não foi possível concluir a ação.");
  return result;
}

export function ServerClientActions({ client, localClient, onChanged }: {
  client: NormalizedServerClient; localClient?: { id: string; phone: string } | undefined; onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode | null>(null);
  const [planId, setPlanId] = useState("");
  const [notes, setNotes] = useState("");
  const enabled = serverClientEnabled(client);
  const identity = { client_id: client.id, service_type: client.type.toLowerCase() as "iptv" | "p2p" };
  const plans = useQuery({
    queryKey: ["portal", "admin", "action-plans", identity.service_type],
    queryFn: () => post<{ plans: NormalizedServerPlan[] }>("server_client_action", { ...identity, operation: "plans" }),
    enabled: mode === "extend" || mode === "plan", retry: false,
  });
  const access = useQuery({
    queryKey: ["portal", "admin", "access-message", identity.service_type, client.id],
    queryFn: () => post<{ message: string }>("server_client_action", { ...identity, operation: "message" }),
    enabled: mode === "message", retry: false, staleTime: 0,
  });
  const mutation = useMutation({
    mutationFn: (payload: ServerClientAction) => post("server_client_action", payload),
    onSuccess: async () => {
      setMode(null);
      toast.success("Cliente atualizado no servidor.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["portal", "admin", "server-clients"] }),
        qc.invalidateQueries({ queryKey: ["portal", "admin", "server-credits"] }),
        qc.invalidateQueries({ queryKey: ["portal", "admin", "access-message"] }),
      ]);
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message || "Falha ao atualizar cliente."),
  });
  const send = useMutation({
    mutationFn: () => post("send_server_access_whatsapp", { ...identity, local_client_id: localClient?.id }),
    onSuccess: () => toast.success("Dados de acesso enviados no WhatsApp."),
    onError: (error: Error) => toast.error(error.message || "Falha ao enviar WhatsApp."),
  });
  const open = (value: Mode) => { setPlanId(""); setNotes(client.notes || client.name || ""); setMode(value); };
  const titles = {
    extend: "Renovar no Servidor", message: "Lista M3U / Dados de Acesso", plan: "Trocar plano", notes: "Editar observação",
    status: enabled ? "Desativar cliente" : "Ativar cliente", delete: "Mover para a Lixeira",
  };
  const submit = () => {
    if (!mode || mode === "message") return;
    const selectedPlan = plans.data?.plans?.find(plan => String(plan.id) === planId);
    mutation.mutate({ ...identity, operation: mode,
      ...(mode === "extend" || mode === "plan" ? { plan_id: selectedPlan?.id } : {}),
      ...(mode === "notes" ? { notes } : {}), ...(mode === "status" ? { enabled: !enabled } : {}),
    });
  };
  const availablePlans = (Array.isArray(plans.data?.plans) ? plans.data.plans : []).filter(plan => plan?.id !== undefined && plan?.id !== null);
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size="sm" variant="outline" disabled={mutation.isPending} className="h-8 shrink-0 gap-1 text-xs bg-invoice-surface text-invoice-foreground">
        Mais ações <ChevronDown className="h-3.5 w-3.5" />
      </Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-invoice-surface text-invoice-foreground">
        <DropdownMenuItem onSelect={() => open("extend")}><RefreshCw />Renovar no Servidor</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open("message")}><FileText />Lista M3U / Dados de Acesso</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open("plan")}><RefreshCw />Trocar plano</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open("notes")}><Pencil />Editar observação</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open("status")}><Power />{titles.status}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => open("delete")} className="text-destructive focus:text-destructive"><Trash2 />Mover para a Lixeira</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={mode !== null} onOpenChange={value => { if (!value && !mutation.isPending && !send.isPending) setMode(null); }}>
      <DialogContent className="w-[94vw] max-w-md max-h-[90dvh] overflow-y-auto bg-invoice-surface text-invoice-foreground">
        <DialogHeader><DialogTitle>{mode ? titles[mode] : "Mais ações"}</DialogTitle><DialogDescription className="text-invoice-muted">{client.username} · {client.type.toUpperCase()}</DialogDescription></DialogHeader>
        {(mode === "extend" || mode === "plan") && <div className="space-y-3">
          <Label htmlFor={`plan-${client.type}-${client.id}`}>Plano no servidor</Label>
          {plans.isPending ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Carregando planos" /> : plans.isError ? <p role="alert" className="text-sm text-destructive">{plans.error.message}<Button variant="ghost" onClick={() => void plans.refetch()}>Tentar novamente</Button></p> : availablePlans.length === 0 ? <p className="text-sm text-invoice-muted">Nenhum plano disponível.</p> :
            <Select value={planId} onValueChange={setPlanId}><SelectTrigger id={`plan-${client.type}-${client.id}`}><SelectValue placeholder="Escolha o plano" /></SelectTrigger><SelectContent>{availablePlans.map(plan => <SelectItem key={String(plan.id)} value={String(plan.id)}>{plan.name}</SelectItem>)}</SelectContent></Select>}
          {mode === "plan" && <p className="text-xs text-invoice-muted">A troca de plano não altera o vencimento nem consome créditos.</p>}
        </div>}
        {mode === "notes" && <div className="space-y-2"><Label htmlFor={`notes-${client.type}-${client.id}`}>Nome / observação</Label><Input id={`notes-${client.type}-${client.id}`} maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} /></div>}
        {mode === "status" && <p className="text-sm">Confirmar {enabled ? "desativação" : "ativação"} de {client.username} no servidor?</p>}
        {mode === "delete" && <p className="text-sm">Mover {client.username} para a Lixeira no servidor e remover da lista ativa?</p>}
        {mode === "message" && <div className="space-y-3">
          {access.isPending ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Carregando dados de acesso" /> : access.isError ? <p role="alert" className="text-sm text-destructive">{access.error.message}<Button variant="ghost" onClick={() => void access.refetch()}>Tentar novamente</Button></p> : <Textarea aria-label="Mensagem de acesso" readOnly value={access.data?.message ?? ""} className="min-h-48" />}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!access.data?.message} onClick={async () => { try { await navigator.clipboard.writeText(access.data?.message ?? ""); toast.success("Dados de acesso copiados."); } catch { toast.error("Não foi possível copiar."); } }}><Copy className="h-4 w-4" />Copiar</Button>
            <Button variant="outline" disabled={!localClient?.phone || !access.data?.message || send.isPending} onClick={() => send.mutate()}>{send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}Enviar no WhatsApp</Button>
          </div>
        </div>}
        <DialogFooter><Button variant="outline" disabled={mutation.isPending || send.isPending} onClick={() => setMode(null)}>Fechar</Button>
          {mode && mode !== "message" && <Button variant={mode === "delete" ? "destructive" : "default"} disabled={mutation.isPending || ((mode === "extend" || mode === "plan") && (!planId || plans.isFetching || plans.isError))} onClick={submit}>{mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Confirmar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}