import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { translateError } from "@/lib/translate-error";
import { addDaysISO, brl, formatDateBR, todayISO } from "@/lib/format";
import { computeStatus } from "@/lib/status";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/solicitacoes")({
  head: () => ({ meta: [{ title: "Solicitações — Painel VIP" }] }),
  component: SolicitacoesPage,
});

type RenewalRequest = {
  id: string;
  client_id: string;
  days: number;
  status: string;
  created_at: string;
  clients: { id: string; name: string; phone: string; due_date: string; price_cents: number; plan_id: string | null; user_id: string } | null;
};

function periodLabel(d: number) {
  if (d === 30) return "Mensal";
  if (d === 90) return "Trimestral";
  if (d === 180) return "Semestral";
  if (d === 365) return "Anual";
  return `${d} dias`;
}

function SolicitacoesPage() {
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ["renewal_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("renewal_requests")
        .select("id,client_id,days,status,created_at,clients:client_id(id,name,phone,due_date,price_cents,plan_id,user_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as RenewalRequest[];
    },
  });

  const approve = useMutation({
    mutationFn: async (req: RenewalRequest) => {
      if (!req.clients) throw new Error("Cliente não encontrado");
      const base = req.clients.due_date && req.clients.due_date >= todayISO() ? req.clients.due_date : todayISO();
      const newDue = addDaysISO(base, req.days);
      // Resolve preço a partir do plano correspondente (mesma duração) ou do cadastro do cliente
      let amount = req.clients.price_cents ?? 0;
      const { data: plan } = await supabase
        .from("plans")
        .select("price_cents")
        .eq("user_id", req.clients.user_id)
        .eq("duration_days", req.days)
        .eq("active", true)
        .maybeSingle();
      if (plan?.price_cents) amount = plan.price_cents;

      const { error: e1 } = await supabase
        .from("clients")
        .update({ due_date: newDue, status: computeStatus(newDue, "ativo") })
        .eq("id", req.client_id);
      if (e1) throw e1;
      const { error: ePay } = await supabase.from("payments").insert({
        user_id: req.clients.user_id,
        client_id: req.client_id,
        amount_cents: amount,
        method: "pix",
        notes: `Renovação ${periodLabel(req.days)} aprovada via portal`,
      });
      if (ePay) throw ePay;
      const { error: e2 } = await supabase.from("renewal_requests").update({ status: "approved" }).eq("id", req.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Renovação aprovada");
      qc.invalidateQueries({ queryKey: ["renewal_requests"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("renewal_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação removida");
      qc.invalidateQueries({ queryKey: ["renewal_requests"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const pending = data.filter((r) => r.status === "pending");
  const done = data.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Solicitações de renovação"
        description="Pedidos feitos pelos clientes através do Portal."
      />

      <Card>
        <CardHeader><CardTitle>Pendentes ({pending.length})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma solicitação pendente.</p>
          ) : (
            <ul className="divide-y">
              {pending.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{r.clients?.name ?? "Cliente"}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.clients?.phone} · vence {r.clients ? formatDateBR(r.clients.due_date) : "—"} · {brl(r.clients?.price_cents ?? 0)}
                    </div>
                    <div className="text-xs text-muted-foreground">Solicitado em {formatDateBR(r.created_at)}</div>
                  </div>
                  <Badge variant="secondary">{periodLabel(r.days)}</Badge>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => approve.mutate(r)} disabled={approve.isPending}>
                      <Check className="mr-1 h-3 w-3" />Aprovar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id)} disabled={remove.isPending}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {done.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Histórico</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y">
              {done.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{r.clients?.name ?? "Cliente"} · {periodLabel(r.days)}</span>
                  <Badge variant="outline">{r.status}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
