import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, UserCheck, AlertTriangle, CalendarClock, CalendarDays } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { brl, formatDateBR, todayISO, addDaysISO } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { statusLabel, statusVariant, computeStatus } from "@/lib/status";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Painel VIP" }] }),
  component: DashboardPage,
});

type ClientRow = { id: string; name: string; price_cents: number; due_date: string; status: "ativo" | "vencido" | "suspenso" | "cancelado" };
type PaymentRow = { amount_cents: number; paid_at: string };
type Settings = { subscription_expires_at: string | null; subscription_monthly_cents: number };

function DashboardPage() {
  const { user } = useAuth();

  const { data: clients = [] } = useQuery({
    queryKey: ["clients", "dash"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id,name,price_cents,due_date,status");
      if (error) throw error;
      return (data as ClientRow[]).map((c) => ({ ...c, status: computeStatus(c.due_date, c.status) }));
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["payments", "dash"],
    queryFn: async () => {
      const since = new Date(); since.setMonth(since.getMonth() - 5); since.setDate(1);
      const { data, error } = await supabase
        .from("payments")
        .select("amount_cents,paid_at")
        .gte("paid_at", since.toISOString());
      if (error) throw error;
      return data as PaymentRow[];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["settings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("subscription_expires_at,subscription_monthly_cents")
        .maybeSingle();
      if (error) throw error;
      return data as Settings | null;
    },
  });

  const stats = useMemo(() => {
    const today = todayISO();
    const in30 = addDaysISO(today, 30);
    let total = 0, ativos = 0, vencidos = 0, hoje = 0, mes = 0;
    for (const c of clients) {
      total++;
      if (c.status === "ativo") ativos++;
      if (c.status === "vencido") vencidos++;
      if (c.due_date === today) hoje++;
      if (c.due_date >= today && c.due_date <= in30) mes++;
    }
    return { total, ativos, vencidos, hoje, mes };
  }, [clients]);

  const revenue = useMemo(() => {
    const months: { key: string; label: string; total: number }[] = [];
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("pt-BR", { month: "short" });
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: fmt.format(d).replace(".", ""), total: 0 });
    }
    for (const p of payments) {
      const d = new Date(p.paid_at);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      const m = months.find((x) => x.key === k);
      if (m) m.total += p.amount_cents / 100;
    }
    return months;
  }, [payments]);

  const monthTotal = revenue.at(-1)?.total ?? 0;

  const statusPie = useMemo(() => {
    const counts: Record<string, number> = { ativo: 0, vencido: 0, suspenso: 0, cancelado: 0 };
    for (const c of clients) counts[c.status] = (counts[c.status] ?? 0) + 1;
    const colors: Record<string, string> = {
      ativo: "var(--kpi-emerald)", vencido: "var(--kpi-rose)", suspenso: "var(--kpi-amber)", cancelado: "var(--muted-foreground)",
    };
    return Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => ({ name: statusLabel[k as keyof typeof statusLabel], value: v, fill: colors[k] }));
  }, [clients]);

  const upcoming = useMemo(() => {
    const today = todayISO();
    const in7 = addDaysISO(today, 7);
    return clients
      .filter((c) => c.due_date >= today && c.due_date <= in7)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 8);
  }, [clients]);

  const subInfo = useMemo(() => {
    if (!settings?.subscription_expires_at) return null;
    const diff = Math.ceil((new Date(settings.subscription_expires_at).getTime() - Date.now()) / 86_400_000);
    return { dateBR: formatDateBR(settings.subscription_expires_at), days: diff };
  }, [settings]);

  return (
    <div className="space-y-6">
      {subInfo && (
        <div className="kpi-card flex items-center justify-between gap-3 px-4 py-3 text-sm" style={{ "--kpi-color": "var(--kpi-amber)" } as React.CSSProperties}>
          <div className="flex items-center gap-2 min-w-0">
            <CalendarClock className="size-4 shrink-0 text-[color:var(--kpi-amber)]" />
            <span className="uppercase tracking-widest text-[11px] text-muted-foreground">Seu painel</span>
            <span className="font-semibold truncate">Vence em: {subInfo.dateBR}</span>
          </div>
          <span className="text-[color:var(--kpi-amber)] font-semibold whitespace-nowrap">{subInfo.days} dia(s) restantes</span>
        </div>
      )}

      <PageHeader title="Dashboard" description="Visão geral em tempo real do seu negócio" />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <Link to="/clientes" search={{ filter: "todos" }} className="block"><KpiCard label="Total de clientes" value={stats.total} icon={Users} color="violet" /></Link>
        <Link to="/clientes" search={{ filter: "em_dia" }} className="block"><KpiCard label="Clientes ativos" value={stats.ativos} icon={UserCheck} color="emerald" /></Link>
        <Link to="/clientes" search={{ filter: "vencidos" }} className="block"><KpiCard label="Vencidos" value={stats.vencidos} icon={AlertTriangle} color="rose" /></Link>
        <Link to="/clientes" search={{ filter: "vencem_hoje" }} className="block"><KpiCard label="Vencem hoje" value={stats.hoje} icon={CalendarClock} color="cyan" /></Link>
        <Link to="/clientes" search={{ filter: "a_vencer" }} className="block"><KpiCard label="A vencer no mês" value={stats.mes} icon={CalendarDays} color="violet" /></Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>Receita</CardTitle>
              <CardDescription>Últimos 6 meses</CardDescription>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Mês atual</p>
              <p className="text-lg font-bold text-[color:var(--kpi-cyan)]">{brl(monthTotal * 100)}</p>
            </div>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer>
              <LineChart data={revenue} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `R$${v}`} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }}
                  formatter={(v: number) => brl(v * 100)}
                />
                <Line type="monotone" dataKey="total" stroke="var(--kpi-cyan)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status dos clientes</CardTitle>
            <CardDescription>Distribuição atual</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            {statusPie.length === 0 ? (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">Nenhum cliente cadastrado ainda.</div>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={statusPie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {statusPie.map((s, i) => <Cell key={i} fill={s.fill} stroke="transparent" />)}
                  </Pie>
                  <Legend />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Próximos vencimentos</CardTitle>
          <CardDescription>Clientes com vencimento nos próximos 7 dias</CardDescription>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">Nenhum cliente nos próximos 7 dias.</p>
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-3 gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">Vence em {formatDateBR(c.due_date)}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm tabular-nums">{brl(c.price_cents)}</span>
                    <Badge variant={statusVariant[c.status]}>{statusLabel[c.status]}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
