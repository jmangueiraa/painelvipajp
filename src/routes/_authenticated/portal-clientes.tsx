import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellOff, Search, Smartphone, XCircle } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateBR, formatDateTimeBR } from "@/lib/format";
import { statusLabel, statusVariant } from "@/lib/status";
import { listPortalClients, type PortalClientRow } from "@/lib/portal-clients.functions";

type FilterKey = "todos" | "instalados" | "nao_instalados" | "ativo" | "vencido" | "cancelado";

const filters: { key: FilterKey; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "instalados", label: "Instalados" },
  { key: "nao_instalados", label: "Não instalados" },
  { key: "ativo", label: "Ativos" },
  { key: "vencido", label: "Inadimplentes" },
  { key: "cancelado", label: "Cancelados" },
];

export const Route = createFileRoute("/_authenticated/portal-clientes")({
  head: () => ({
    meta: [
      { title: "Portal dos Clientes — Painel VIP" },
      { name: "description", content: "Acompanhe quais clientes já instalaram o aplicativo PWA." },
    ],
  }),
  component: PortalClientsPage,
});

function PortalClientsPage() {
  const list = useServerFn(listPortalClients);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("todos");

  const { data = [], isLoading } = useQuery({
    queryKey: ["portal-clients"],
    queryFn: () => list(),
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data as PortalClientRow[]).filter((c) => {
      if (filter === "instalados" && !c.installed) return false;
      if (filter === "nao_instalados" && c.installed) return false;
      if (filter === "ativo" && c.status !== "ativo") return false;
      if (filter === "vencido" && c.status !== "vencido") return false;
      if (filter === "cancelado" && c.status !== "cancelado") return false;
      if (!term) return true;
      const hay = `${c.name} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase();
      return hay.includes(term);
    });
  }, [data, filter, q]);

  const kpi = useMemo(() => {
    const total = data.length;
    const installed = (data as PortalClientRow[]).filter((c) => c.installed).length;
    const pct = total ? Math.round((installed * 100) / total) : 0;
    return { total, installed, notInstalled: total - installed, pct };
  }, [data]);

  return (
    <div className="space-y-6">
      <PageHeader title="Portal dos Clientes" description="Acompanhe quais clientes já instalaram o aplicativo PWA." />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Total de clientes" value={kpi.total} color="var(--kpi-violet)" />
        <KpiTile label="App instalado" value={`${kpi.installed} (${kpi.pct}%)`} color="var(--kpi-emerald)" />
        <KpiTile label="Não instalaram" value={kpi.total - kpi.installed} color="var(--kpi-rose)" />
        <KpiTile label="Adoção" value={`${kpi.pct}%`} color="var(--kpi-cyan)" />
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar por nome, e-mail ou telefone" className="pl-9" />
            </div>
            <div className="flex flex-wrap gap-2">
              {filters.map((f) => (
                <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"} onClick={() => setFilter(f.key)}>
                  {f.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="hidden md:table-cell">E-mail</TableHead>
                  <TableHead className="hidden md:table-cell">Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Cadastro</TableHead>
                  <TableHead className="hidden lg:table-cell">Instalação</TableHead>
                  <TableHead className="hidden xl:table-cell">Último acesso</TableHead>
                  <TableHead className="hidden xl:table-cell">Dispositivo</TableHead>
                  <TableHead>App</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum cliente encontrado.</TableCell></TableRow>
                ) : (
                  filtered.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/40">
                      <TableCell>
                        <Link to="/portal-clientes/$id" params={{ id: c.id }} className="font-medium hover:underline">
                          {c.name}
                        </Link>
                        <div className="text-xs text-muted-foreground md:hidden">{c.email || c.phone}</div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{c.email || "—"}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm">{c.plan_name || "—"}</TableCell>
                      <TableCell><Badge variant={statusVariant[c.status]}>{statusLabel[c.status]}</Badge></TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{formatDateBR(c.created_at)}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{c.pwa_installed_at ? formatDateTimeBR(c.pwa_installed_at) : "—"}</TableCell>
                      <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">{c.last_login_at ? formatDateTimeBR(c.last_login_at) : "—"}</TableCell>
                      <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">{c.last_device || (c.os ? `${c.os} · ${c.browser ?? ""}` : "—")}</TableCell>
                      <TableCell>
                        {c.installed ? (
                          <span className="inline-flex items-center gap-1 text-emerald-500 text-sm"><Smartphone className="size-4" />Instalado</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground text-sm"><XCircle className="size-4" />Não instalado</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiTile({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="kpi-card p-4" style={{ "--kpi-color": color } as React.CSSProperties}>
      <p className="text-[11px] font-medium tracking-widest uppercase text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums" style={{ color }}>{value}</p>
    </div>
  );
}
