import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { translateError } from "@/lib/translate-error";
import { brl, formatDateBR, todayISO, addDaysISO } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/loja/clientes")({
  head: () => ({ meta: [{ title: "Clientes da Loja — Painel VIP" }] }),
  component: LojaClientesPage,
});

type Purchase = {
  id: string;
  client_id: string;
  product_id: string | null;
  label: string;
  sale_cents: number;
  cost_cents: number;
  duration_days: number;
  purchased_at: string;
  due_date: string;
  status: string;
  clients: { id: string; name: string; phone: string | null } | null;
};

function statusOf(due: string): "ativo" | "vence_hoje" | "vencido" {
  const t = todayISO();
  if (due < t) return "vencido";
  if (due === t) return "vence_hoje";
  return "ativo";
}

function LojaClientesPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"todos" | "ativos" | "vencidos">("todos");
  const [q, setQ] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["store_purchases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_purchases")
        .select("id,client_id,product_id,label,sale_cents,cost_cents,duration_days,purchased_at,due_date,status,clients:client_id(id,name,phone)")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data as unknown as Purchase[];
    },
  });

  const renew = useMutation({
    mutationFn: async (p: Purchase) => {
      const base = p.due_date >= todayISO() ? p.due_date : todayISO();
      const newDue = addDaysISO(base, p.duration_days);
      const { error } = await supabase.from("store_purchases").update({ due_date: newDue, status: "ativo" }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Renovação registrada");
      qc.invalidateQueries({ queryKey: ["store_purchases"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("store_purchases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["store_purchases"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return data.filter((p) => {
      const s = statusOf(p.due_date);
      if (filter === "ativos" && s === "vencido") return false;
      if (filter === "vencidos" && s !== "vencido") return false;
      if (ql && !(p.clients?.name.toLowerCase().includes(ql) || p.label.toLowerCase().includes(ql))) return false;
      return true;
    });
  }, [data, filter, q]);

  const totals = useMemo(() => {
    let venda = 0, custo = 0;
    for (const p of data) { venda += p.sale_cents; custo += p.cost_cents; }
    return { venda, custo, lucro: venda - custo };
  }, [data]);

  return (
    <div className="space-y-6">
      <PageHeader title="Clientes da Loja" description="Compras e vencimentos dos serviços vendidos pela loja." />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4">
          <p className="text-xs uppercase tracking-wider font-semibold text-zinc-400">Total vendido</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-100">{brl(totals.venda)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4">
          <p className="text-xs uppercase tracking-wider font-semibold text-zinc-400">Custo total</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-rose-400">{brl(totals.custo)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4">
          <p className="text-xs uppercase tracking-wider font-semibold text-zinc-400">Lucro</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-400">{brl(totals.lucro)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente ou produto" className="pl-9" />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="ativos">Ativos</SelectItem>
            <SelectItem value="vencidos">Vencidos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-sm text-zinc-500">Carregando…</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500 text-center py-8">Nenhuma compra encontrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/40 text-left text-xs uppercase tracking-wider text-zinc-400 border-b border-zinc-800/60">
                  <tr>
                    <th className="p-3 font-medium">Cliente</th>
                    <th className="p-3 font-medium">Produto</th>
                    <th className="p-3 font-medium">Compra</th>
                    <th className="p-3 font-medium">Vencimento</th>
                    <th className="p-3 font-medium">Venda</th>
                    <th className="p-3 font-medium">Custo</th>
                    <th className="p-3 font-medium">Lucro</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {rows.map((p) => {
                    const s = statusOf(p.due_date);
                    return (
                      <tr key={p.id} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="p-3">
                          <div className="font-medium text-zinc-100">{p.clients?.name ?? "—"}</div>
                          {p.clients?.phone && <div className="text-xs text-zinc-400">{p.clients.phone}</div>}
                        </td>
                        <td className="p-3 text-zinc-200">{p.label}</td>
                        <td className="p-3 whitespace-nowrap text-zinc-400">{formatDateBR(p.purchased_at)}</td>
                        <td className="p-3 whitespace-nowrap text-zinc-400">{formatDateBR(p.due_date)}</td>
                        <td className="p-3 tabular-nums text-zinc-300">{brl(p.sale_cents)}</td>
                        <td className="p-3 tabular-nums text-zinc-400">{brl(p.cost_cents)}</td>
                        <td className="p-3 tabular-nums font-semibold text-emerald-400">{brl(p.sale_cents - p.cost_cents)}</td>
                        <td className="p-3">
                          <Badge variant={s === "vencido" ? "rose" : s === "vence_hoje" ? "amber" : "emerald"}>
                            {s === "vencido" ? "Vencido" : s === "vence_hoje" ? "Vence hoje" : "Ativo"}
                          </Badge>
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          <Button size="sm" variant="outline" className="mr-1" onClick={() => renew.mutate(p)} disabled={renew.isPending}>
                            <RefreshCw className="mr-1 h-3.5 w-3.5" />Renovar
                          </Button>
                          <Button size="icon" variant="ghost" className="text-zinc-400 hover:text-rose-400" onClick={() => { if (confirm("Excluir compra?")) remove.mutate(p.id); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
