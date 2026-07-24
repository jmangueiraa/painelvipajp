import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, BellOff, Search, Smartphone, XCircle } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTimeBR } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import type { PortalClientRow } from "@/lib/portal-clients.functions";

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
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("todos");

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["portal-clients-list"],
    queryFn: async (): Promise<PortalClientRow[]> => {
      const { data: clients, error: err } = await supabase
        .from("clients")
        .select("id,name,email,phone,due_date,status,created_at,pwa_installed_at,last_login_at,last_device,login_count,plan_id")
        .order("created_at", { ascending: false });
      if (err) throw new Error(err.message);
      const rows = (clients || []) as Array<{
        id: string; name: string; email: string | null; phone: string | null;
        due_date: string; status: PortalClientRow["status"]; created_at: string;
        pwa_installed_at: string | null; last_login_at: string | null; last_device: string | null;
        login_count: number | null; plan_id: string | null;
      }>;

      const planIds = Array.from(new Set(rows.map((c) => c.plan_id).filter((x): x is string => !!x)));
      const plansById = new Map<string, string>();
      if (planIds.length) {
        const { data: plans } = await supabase.from("plans").select("id,name").in("id", planIds);
        for (const p of (plans || []) as Array<{ id: string; name: string }>) plansById.set(p.id, p.name);
      }

      const ids = rows.map((c) => c.id);
      const tokenSet = new Set<string>();
      if (ids.length) {
        const { data: toks } = await supabase.from("push_tokens").select("client_id").in("client_id", ids);
        for (const t of (toks || []) as Array<{ client_id: string | null }>) if (t.client_id) tokenSet.add(t.client_id);
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return rows.map((c) => {
        const due = new Date(c.due_date + "T00:00:00");
        let status: PortalClientRow["status"] = c.status;
        if (status !== "suspenso" && status !== "cancelado") {
          status = due < today ? "vencido" : "ativo";
        }
        return {
          id: c.id, name: c.name, email: c.email, phone: c.phone,
          plan_name: c.plan_id ? plansById.get(c.plan_id) ?? null : null,
          status, due_date: c.due_date, created_at: c.created_at,
          pwa_installed_at: c.pwa_installed_at,
          last_login_at: c.last_login_at, last_device: c.last_device,
          login_count: c.login_count ?? 0,
          os: null, browser: null, app_version: null,
          installed: !!c.pwa_installed_at,
          notifications_enabled: tokenSet.has(c.id),
        };
      });
    },
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

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Erro ao carregar clientes: {(error as Error).message}
        </div>
      )}



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

          {/* Mobile: cards */}
          <div className="md:hidden space-y-2">
            {isLoading ? (
              <p className="text-center py-8 text-sm text-muted-foreground">Carregando…</p>
            ) : filtered.length === 0 ? (
              <p className="text-center py-8 text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
            ) : (
              filtered.map((c) => {
                const dot =
                  c.status === "ativo" ? "bg-emerald-500"
                  : c.status === "vencido" ? "bg-amber-500"
                  : c.status === "cancelado" ? "bg-rose-500"
                  : "bg-muted-foreground";
                const statusText =
                  c.status === "ativo" ? "Ativo"
                  : c.status === "vencido" ? "Inadimpl."
                  : c.status === "cancelado" ? "Cancelado"
                  : "Suspenso";
                return (
                  <Link
                    key={c.id}
                    to="/portal-clientes/$id"
                    params={{ id: c.id }}
                    className="block rounded-lg border p-3 hover:bg-muted/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.plan_name || "—"}</p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-xs shrink-0">
                        <span className={`inline-block size-2 rounded-full ${dot}`} />
                        {statusText}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      {c.installed ? (
                        <span className="inline-flex items-center gap-1 text-sky-500"><Smartphone className="size-3.5" />Instalado</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-500"><XCircle className="size-3.5" />Não instalado</span>
                      )}
                      {c.notifications_enabled ? (
                        <span className="inline-flex items-center gap-1 text-emerald-500"><Bell className="size-3.5" />Notif.</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground"><BellOff className="size-3.5" />Sem notif.</span>
                      )}
                      <span className="text-muted-foreground ml-auto">
                        {c.last_login_at ? formatDateTimeBR(c.last_login_at) : "—"}
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notificações</TableHead>
                  <TableHead>App PWA</TableHead>
                  <TableHead>Último acesso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum cliente encontrado.</TableCell></TableRow>
                ) : (
                  filtered.map((c) => {
                    const dot =
                      c.status === "ativo" ? "bg-emerald-500"
                      : c.status === "vencido" ? "bg-amber-500"
                      : c.status === "cancelado" ? "bg-rose-500"
                      : "bg-muted-foreground";
                    const statusText =
                      c.status === "ativo" ? "Ativo"
                      : c.status === "vencido" ? "Inadimpl."
                      : c.status === "cancelado" ? "Cancelado"
                      : "Suspenso";
                    return (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-muted/40">
                        <TableCell>
                          <Link to="/portal-clientes/$id" params={{ id: c.id }} className="font-medium hover:underline">
                            {c.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">{c.plan_name || "—"}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-2 text-sm">
                            <span className={`inline-block size-2.5 rounded-full ${dot}`} />
                            {statusText}
                          </span>
                        </TableCell>
                        <TableCell>
                          {c.notifications_enabled ? (
                            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-500"><Bell className="size-4" />Ativadas</span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><BellOff className="size-4" />Desativadas</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {c.installed ? (
                            <span className="inline-flex items-center gap-1.5 text-sm text-sky-500"><Smartphone className="size-4" />Instalado</span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-sm text-rose-500"><XCircle className="size-4" />Não</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.last_login_at ? formatDateTimeBR(c.last_login_at) : "—"}</TableCell>
                      </TableRow>
                    );
                  })
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
