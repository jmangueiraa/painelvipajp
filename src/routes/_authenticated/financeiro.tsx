import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet, TrendingUp, ArrowUpRight, ArrowDownRight, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { brl, formatDateBR, formatDateTimeBR } from "@/lib/format";

import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro — Painel VIP" }] }),
  component: FinanceiroPage,
});

type Payment = { id: string; amount_cents: number; paid_at: string; method: string | null; client_id: string };
type Client = { id: string; name: string; price_cents: number; server_id: string | null; plan_id: string | null; status: "ativo" | "vencido" | "suspenso" | "cancelado" };
type Plan = { id: string; duration_days: number };
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

  const { data: storeSales = [] } = useQuery({
    queryKey: ["store_purchases", "fin"],
    queryFn: async () => {
      const since = new Date(); since.setMonth(since.getMonth() - 11); since.setDate(1);
      const { data, error } = await supabase
        .from("store_purchases")
        .select("id,label,sale_cents,cost_cents,purchased_at,buyer_name,client_id")
        .gte("purchased_at", since.toISOString())
        .order("purchased_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; label: string; sale_cents: number; cost_cents: number; purchased_at: string; buyer_name: string | null; client_id: string | null }[];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients", "fin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id,name,price_cents,server_id,plan_id,status");
      if (error) throw error;
      return data as Client[];
    },
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["plans", "fin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("id,duration_days");
      if (error) throw error;
      return data as Plan[];
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
  const planMap = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);
  const monthsForClient = useMemo(() => {
    return (clientId: string) => {
      const c = clientMap.get(clientId);
      if (!c?.plan_id) return 1;
      const p = planMap.get(c.plan_id);
      if (!p) return 1;
      return Math.max(1, Math.round(p.duration_days / 30));
    };
  }, [clientMap, planMap]);
  const serverCost = useMemo(() => {
    const m = new Map(servers.map((s) => [s.id, s.credit_cost_cents]));
    return (clientId: string) => {
      const c = clientMap.get(clientId);
      if (!c?.server_id) return 0;
      const base = m.get(c.server_id) ?? 0;
      return base * monthsForClient(clientId);
    };
  }, [servers, clientMap, monthsForClient]);

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

    // Soma vendas da loja
    for (const s of storeSales) {
      const d = new Date(s.purchased_at);
      const profit = s.sale_cents - (s.cost_cents ?? 0);
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
  }, [payments, storeSales, clients, serverCost]);

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
    for (const s of storeSales) {
      const d = new Date(s.purchased_at);
      const m = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
      if (m) m.total += s.sale_cents / 100;
    }
    return months;
  }, [payments, storeSales]);

  const historyEntries = useMemo(() => {
    const iptv = payments.map((p) => ({
      id: `p-${p.id}`,
      name: clientMap.get(p.client_id)?.name ?? "—",
      date: p.paid_at,
      method: p.method ?? "—",
      amount: p.amount_cents,
      kind: "IPTV",
    }));
    const store = storeSales.map((s) => ({
      id: `s-${s.id}`,
      name: s.buyer_name ?? clientMap.get(s.client_id ?? "")?.name ?? "Loja",
      date: s.purchased_at,
      method: s.label,
      amount: s.sale_cents,
      kind: "Loja",
    }));
    return [...iptv, ...store].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [payments, storeSales, clientMap]);


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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Método/Produto</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyEntries.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum pagamento registrado.</TableCell></TableRow>
                ) : historyEntries.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium whitespace-nowrap">{p.name}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{p.kind}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTimeBR(p.date)}</TableCell>
                    <TableCell className="capitalize whitespace-nowrap">{p.method}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{brl(p.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
