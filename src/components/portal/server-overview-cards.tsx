import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Calendar, CalendarClock, Coins, Tv, UserCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { todayISO } from "@/lib/format";
import { dueThisMonth, serverClientsQueryOptions, type ServerClientStatusFilter } from "@/lib/server-client-summary";

function MetricCard({ label, value, icon, tone = "neutral", onClick }: {
  label: string; value: ReactNode; icon: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  onClick: () => void;
}) {
  return (
    <Button variant="ghost" onClick={onClick} className="server-metric-card" data-tone={tone}>
      <span className="server-metric-heading">
        <span className="server-metric-label">{label}</span>
        <span className="server-metric-icon">{icon}</span>
      </span>
      <span className="server-metric-value">{value}</span>
    </Button>
  );
}

export function ServerOverviewCards({ online, credits, onClients, onOnline, onCredits }: {
  online: number; credits: string;
  onClients: (filter: ServerClientStatusFilter) => void;
  onOnline: () => void; onCredits: () => void;
}) {
  const query = useQuery(serverClientsQueryOptions);
  const summary = query.data?.ok ? query.data : undefined;
  const kpis = summary?.kpis;
  const monthly = summary?.clients.filter(c => dueThisMonth(c, todayISO())).length;
  return (
    <section className="space-y-2.5" aria-label="Visão geral do negócio RBOYS">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <h3 className="text-sm font-extrabold text-invoice-foreground">Visão geral do negócio</h3>
        <span className="text-[10px] font-semibold text-invoice-muted">{summary?.server_name || "RBOYS"}</span>
      </div>
      <div className="server-metrics-grid">
        <MetricCard label="Total de clientes" value={kpis?.total ?? "--"} icon={<Users />} onClick={() => onClients("todos")} />
        <MetricCard label="Clientes ativos" value={kpis?.ativos ?? "--"} icon={<UserCheck />} tone="success" onClick={() => onClients("ativos")} />
        <MetricCard label="Clientes online" value={online} icon={<Tv />} tone="success" onClick={onOnline} />
        <MetricCard label="Créditos RBOYS" value={credits} icon={<Coins />} tone="info" onClick={onCredits} />
        <MetricCard label="Vencidos" value={kpis?.vencidos ?? "--"} icon={<AlertTriangle />} tone="danger" onClick={() => onClients("vencidos")} />
        <MetricCard label="Vencem hoje" value={kpis?.vencem_hoje ?? "--"} icon={<CalendarClock />} tone="warning" onClick={() => onClients("vencem_hoje")} />
        <MetricCard label="A vencer no mês" value={monthly ?? "--"} icon={<Calendar />} tone="info" onClick={() => onClients("a_vencer_mes")} />
      </div>
    </section>
  );
}