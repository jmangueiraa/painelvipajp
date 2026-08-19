import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { translateError } from "@/lib/translate-error";
import { notifyEventFn } from "@/lib/notifications.functions";
import { addDaysISO, addMonthsISO, brl, formatDateBR, todayISO } from "@/lib/format";
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
  amount_cents: number | null;
  status: string;
  created_at: string;
  label: string | null;
  clients: { id: string; name: string; phone: string; portal_username: string | null; due_date: string; price_cents: number; plan_id: string | null; user_id: string } | null;
};

function periodLabel(d: number) {
  if (d === 30) return "Mensal";
  if (d === 90) return "Trimestral";
  if (d === 180) return "Semestral";
  if (d === 365) return "Anual";
  return `${d} dias`;
}

function itemLabel(r: RenewalRequest) {
  if (r.days === 0) return r.label ?? "Produto avulso";
  return r.label ? `${periodLabel(r.days)} · ${r.label}` : periodLabel(r.days);
}

function normalizeProductLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function SolicitacoesPage() {
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ["renewal_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("renewal_requests")
        .select("id,client_id,days,amount_cents,status,created_at,label,clients:client_id(id,name,phone,portal_username,due_date,price_cents,plan_id,user_id)")
        .neq("status", "awaiting_payment")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as RenewalRequest[];
    },
  });

  const approve = useMutation({
    mutationFn: async (req: RenewalRequest) => {
      if (!req.clients) throw new Error("Cliente não encontrado");
      const isExtra = req.days === 0;
      const alreadyPaid = req.status === "paid";

      // Se já foi pago via Mercado Pago, apenas marca como entregue/aprovado
      // (pagamento e extensão já foram registrados pelo webhook).
      if (alreadyPaid) {
        // Para produtos da loja, registra a compra com vencimento
        if (isExtra) {
          const label = req.label ?? "Produto avulso";
          const { data: products, error: prodErr } = await supabase
            .from("store_products")
            .select("id,label,sale_cents,cost_cents,duration_days")
            .eq("user_id", req.clients.user_id)
            .order("sort_order", { ascending: true });
          if (prodErr) throw prodErr;
          const normalizedLabel = normalizeProductLabel(label);
          const prod = (products ?? []).find((p) => normalizeProductLabel(p.label) === normalizedLabel)
            ?? (products ?? []).find((p) => req.amount_cents != null && p.sale_cents === req.amount_cents)
            ?? null;
          const duration = prod?.duration_days ?? 30;
          const sale = prod?.sale_cents ?? req.amount_cents ?? 0;
          const cost = prod?.cost_cents ?? 0;
          const due = addDaysISO(todayISO(), duration);
          const { error: eBuy } = await supabase.from("store_purchases").insert({
            user_id: req.clients.user_id,
            client_id: req.client_id,
            product_id: prod?.id ?? null,
            label,
            sale_cents: sale,
            cost_cents: cost,
            duration_days: duration,
            due_date: due,
            status: "ativo",
            renewal_request_id: req.id,
          });
          if (eBuy) throw eBuy;
        }
        const { error } = await supabase.from("renewal_requests").update({ status: "approved" }).eq("id", req.id);
        if (error) throw error;
        return;
      }

      // Resolve preço a partir do plano correspondente (mesma duração) ou do cadastro do cliente
      let amount = req.clients.price_cents ?? 0;
      if (!isExtra) {
        const { data: plan } = await supabase
          .from("plans")
          .select("price_cents")
          .eq("user_id", req.clients.user_id)
          .eq("duration_days", req.days)
          .eq("active", true)
          .maybeSingle();
        if (plan?.price_cents) amount = plan.price_cents;

        const base = req.clients.due_date || todayISO();
        let newDue = addDaysISO(base, req.days);
        
        // Garantia de vencimento futuro caso o cliente estivesse muito atrasado
        if (newDue < todayISO()) {
          newDue = addDaysISO(todayISO(), req.days);
        }
        const { error: e1 } = await supabase
          .from("clients")
          .update({ due_date: newDue, status: computeStatus(newDue, "ativo") })
          .eq("id", req.client_id);
        if (e1) throw e1;
      }
      const { error: ePay } = await supabase.from("payments").insert({
        user_id: req.clients.user_id,
        client_id: req.client_id,
        amount_cents: amount,
        method: "pix",
        notes: isExtra ? (req.label ?? "Produto avulso") : `Renovação ${periodLabel(req.days)} aprovada via portal`,
      });
      if (ePay) throw ePay;
      const { error: e2 } = await supabase.from("renewal_requests").update({ status: "approved" }).eq("id", req.id);
      if (e2) throw e2;

      // Notifica Telegram (best-effort)
      try {
        const payload = {
          nome: req.clients.name,
          telefone: req.clients.phone,
          plano: isExtra ? (req.label ?? "Produto avulso") : `Renovação ${periodLabel(req.days)}`,
          valor: (amount / 100).toFixed(2).replace(".", ","),
          metodo: "Manual (admin)",
        };
        if (isExtra) {
          await notifyEventFn({ data: { event: "new_sale", payload } });
        } else {
          await notifyEventFn({ data: { event: "renewal", payload } });
        }
        await notifyEventFn({ data: { event: "payment_approved", payload } });
      } catch (err) {
        console.error("[solicitacoes] notify failed", err);
      }
    },
    onSuccess: () => {
      toast.success("Solicitação aprovada");
      qc.invalidateQueries({ queryKey: ["renewal_requests"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
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

  const pending = data.filter((r) => r.status === "pending" || (r.status === "paid" && r.days === 0));
  const done = data.filter((r) => r.status !== "pending" && !(r.status === "paid" && r.days === 0));

  const statusLabel = (s: string) =>
    s === "paid" ? "Pago" : s === "approved" ? "Aprovado" : s === "pending" ? "Pendente" : s === "rejected" ? "Rejeitado" : s;

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
                    <div className="font-medium">
                      {r.clients?.name ?? "Cliente"}
                      {r.clients?.portal_username && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">@{r.clients.portal_username}</span>
                      )}
                    </div>
                    <div className="text-xs font-medium text-primary">
                      {r.days === 0 ? "🛒 " : ""}{itemLabel(r)}
                    </div>
                    {r.days !== 0 && (
                      <div className="text-xs text-muted-foreground">
                        {r.clients?.phone} · vence {r.clients ? formatDateBR(r.clients.due_date) : "—"} · {brl(r.clients?.price_cents ?? 0)}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">Solicitado em {formatDateBR(r.created_at)}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={r.days === 0 ? "default" : "secondary"}>{r.days === 0 ? "Loja" : periodLabel(r.days)}</Badge>
                    <Badge variant={r.status === "paid" ? "default" : "outline"} className={r.status === "paid" ? "bg-emerald-600 hover:bg-emerald-600" : ""}>
                      {statusLabel(r.status)}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => approve.mutate(r)} disabled={approve.isPending}>
                      <Check className="mr-1 h-3 w-3" />{r.status === "paid" ? "Entregar" : "Aprovar"}
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
                  <span>
                    {r.clients?.name ?? "Cliente"}
                    {r.clients?.portal_username && <span className="ml-1 text-xs text-muted-foreground">(@{r.clients.portal_username})</span>}
                    {" · "}{itemLabel(r)}
                  </span>
                  <Badge variant="outline">{statusLabel(r.status)}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
