import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet, TrendingUp, ArrowUpRight, ArrowDownRight, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { brl, formatDateBR } from "@/lib/format";

import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro — Painel VIP" }] }),
  component: FinanceiroPage,
});

type Payment = { id: string; amount_cents: number; paid_at: string; method: string | null; client_id: string };
type Client = { id: string; name: string; price_cents: number; server_id: string | null; status: "ativo" | "vencido" | "suspenso" | "cancelado" };
type Server = { id: string; credit_cost_cents: number };

function FinanceiroPage() {
  const { data: payments = [] } = useQuery({
    queryKey: ["payments", "fin"],
    queryFn: async () => {
      const since = new Date(); since.setMonth(since.getMonth() - 11); since.setDate(1);
      const { data, error } = await supabase
        .from("payments")
        .select("id,amount_cents,paid_at,method,client_id")
        .gte("paid_at", since.toISOString())
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data as Payment[];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients", "fin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id,name,price_cents,server_id,status");
      if (error) throw error;
      return data as Client[];
    },
  });

  const { data: servers = [] } = useQuery({
    queryKey: ["servers", "fin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("servers").select("id,credit_cost_cents");
      if (error) throw error;
      return data as Server[];
    },
  });

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const serverCost = useMemo(() => {
    const m = new Map(servers.map((s) => [s.id, s.credit_cost_cents]));
    return (clientId: string) => {
      const c = clientMap.get(clientId);
      if (!c?.server_id) return 0;
      return m.get(c.server_id) ?? 0;
    };
  }, [servers, clientMap]);

  const stats = useMemo(() => {
    const now = new Date();
    const ym = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
    const curYM = ym(now);
    const curYear = now.getFullYear();

    // Receita/Despesa do mês: baseado em clientes ativos (recorrência mensal)
    let receitaMes = 0, despesaMes = 0;
    for (const c of clients) {
      if (c.status === "cancelado" || c.status === "suspenso") continue;
      receitaMes += c.price_cents;
      despesaMes += serverCost(c.id);
    }

    // Lucro do ano e total: baseado em pagamentos efetivos
    let lucroAno = 0, lucroTotal = 0, lucroPagamentosMes = 0;
    for (const p of payments) {
      const d = new Date(p.paid_at);
      const cost = serverCost(p.client_id);
      const profit = p.amount_cents - cost;
      lucroTotal += profit;
      if (d.getFullYear() === curYear) lucroAno += profit;
      if (ym(d) === curYM) lucroPagamentosMes += profit;
    }

    const projecaoMes = receitaMes - despesaMes;
    return {
      receitaMes,
      despesaMes,
      lucroMes: lucroPagamentosMes > 0 ? lucroPagamentosMes : projecaoMes,
      lucroAno: lucroAno || projecaoMes,
      lucroTotal: lucroTotal || projecaoMes,
    };
  }, [payments, clients, serverCost]);

  const chart = useMemo(() => {
    const months: { key: string; label: string; total: number }[] = [];
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("pt-BR", { month: "short" });
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: fmt.format(d).replace(".", ""), total: 0 });
    }
    for (const p of payments) {
      const d = new Date(p.paid_at);
      const m = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
      if (m) m.total += p.amount_cents / 100;
    }
    return months;
  }, [payments]);

  const totalClientesValor = useMemo(() => clients.reduce((acc, c) => acc + c.price_cents, 0), [clients]);

  return (
    <div className="space-y-6">
      <PageHeader title="Financeiro" description="Controle de recebimentos e histórico de pagamentos" />

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Lucro do mês" value={brl(stats.lucroMes)} icon={Wallet} color="violet" />
        <KpiCard label="Lucro do ano" value={brl(stats.lucroAno)} icon={TrendingUp} color="cyan" />
        <KpiCard label="Lucro total" value={brl(stats.lucroTotal)} icon={ArrowUpRight} color="emerald" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <KpiCard label="Receitas do mês" value={brl(stats.receitaMes)} icon={ArrowUpRight} color="emerald" />
        <KpiCard label="Despesas de crédito do mês" value={brl(stats.despesaMes)} icon={ArrowDownRight} color="rose" />
      </div>

      <Card>
        <CardHeader><CardTitle>Recebimentos — 12 meses</CardTitle></CardHeader>
        <CardContent className="h-[260px]">
          <ResponsiveContainer>
            <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `R$${v}`} />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }}
                formatter={(v: number) => brl(v * 100)}
              />
              <Bar dataKey="total" fill="var(--kpi-cyan)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Histórico de pagamentos</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Método</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhum pagamento registrado.</TableCell></TableRow>
              ) : payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{clientMap.get(p.client_id)?.name ?? "—"}</TableCell>
                  <TableCell>{formatDateBR(p.paid_at)}</TableCell>
                  <TableCell className="capitalize">{p.method ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{brl(p.amount_cents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="kpi-card" style={{ "--kpi-color": "var(--kpi-emerald)" } as React.CSSProperties}>
        <CardContent className="p-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] tracking-widest uppercase text-muted-foreground">Clientes no valor do mês</p>
            <p className="text-2xl md:text-3xl font-bold text-[color:var(--kpi-emerald)] mt-1 tabular-nums">{brl(totalClientesValor)}</p>
            <p className="text-xs text-muted-foreground mt-1">{clients.length} cliente(s) cadastrado(s)</p>
          </div>
          <div className="size-12 rounded-xl grid place-items-center bg-[color:color-mix(in_oklab,var(--kpi-emerald)_15%,transparent)] text-[color:var(--kpi-emerald)]">
            <Users className="size-6" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
