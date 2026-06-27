import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ShieldCheck, Users as UsersIcon, BadgeCheck, AlertTriangle, Ban, DollarSign, Search, Loader2,
  RefreshCw, Store, Trash2,
} from "lucide-react";

import { listSubscribers, renewSubscriberDays, deleteSubscriber, promoteToReseller, type SubscriberRow } from "@/lib/admin-subscribers.functions";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { translateError } from "@/lib/translate-error";
import { brl, formatDateBR } from "@/lib/format";

import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin/assinantes")({
  head: () => ({ meta: [{ title: "Assinantes — Painel VIP" }] }),
  component: AssinantesPage,
});

const STATUS_LABEL: Record<string, string> = {
  ativa: "Ativa",
  pendente: "Pendente",
  cancelada: "Cancelada",
  vencida: "Vencida",
  teste_gratis: "Teste grátis",
};
const STATUS_TONE: Record<string, string> = {
  ativa: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  pendente: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  cancelada: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  vencida: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  teste_gratis: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="outline" className="opacity-60">—</Badge>;
  return (
    <Badge variant="outline" className={STATUS_TONE[status] ?? ""}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

function AssinantesPage() {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const listFn = useServerFn(listSubscribers);
  const renewFn = useServerFn(renewSubscriberDays);
  const deleteFn = useServerFn(deleteSubscriber);
  const promoteFn = useServerFn(promoteToReseller);
  const qc = useQueryClient();

  const [renewTarget, setRenewTarget] = useState<SubscriberRow | null>(null);
  const [renewDays, setRenewDays] = useState("30");
  const [deleteTarget, setDeleteTarget] = useState<SubscriberRow | null>(null);

  const renewMut = useMutation({
    mutationFn: async () => renewFn({ data: { userId: renewTarget!.user_id, days: Number(renewDays) } }),
    onSuccess: () => {
      toast.success("Assinatura renovada.");
      setRenewTarget(null);
      setRenewDays("30");
      qc.invalidateQueries({ queryKey: ["admin", "subscribers"] });
    },
    onError: (e) => toast.error(translateError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async () => deleteFn({ data: { userId: deleteTarget!.user_id } }),
    onSuccess: () => {
      toast.success("Assinante excluído.");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["admin", "subscribers"] });
    },
    onError: (e) => toast.error(translateError(e)),
  });

  const promoteMut = useMutation({
    mutationFn: async (userId: string) => promoteFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("Assinante promovido a revendedor.");
      qc.invalidateQueries({ queryKey: ["admin", "subscribers"] });
    },
    onError: (e) => toast.error(translateError(e)),
  });

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("todos");
  const [planFilter, setPlanFilter] = useState<string>("todos");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<string>("recentes");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "subscribers"],
    queryFn: () => listFn(),
    enabled: isAdmin,
  });

  const rows = data ?? [];

  const plansOptions = useMemo(() => {
    const set = new Map<string, string>();
    rows.forEach((r) => {
      if (r.subscription.plan_id && r.subscription.plan_name) {
        set.set(r.subscription.plan_id, r.subscription.plan_name);
      }
    });
    return Array.from(set, ([id, name]) => ({ id, name }));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo + "T23:59:59") : null;

    let out = rows.filter((r) => {
      if (q) {
        const hay = `${r.full_name ?? ""} ${r.email ?? ""} ${r.company_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (status !== "todos" && r.subscription.status !== status) return false;
      if (planFilter !== "todos" && r.subscription.plan_id !== planFilter) return false;
      if (from || to) {
        const d = r.subscription.started_at ? new Date(r.subscription.started_at) : new Date(r.account_created_at);
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      return true;
    });

    const dateOf = (r: SubscriberRow) =>
      new Date(r.subscription.started_at ?? r.account_created_at).getTime();
    if (sort === "recentes") out = [...out].sort((a, b) => dateOf(b) - dateOf(a));
    else if (sort === "antigos") out = [...out].sort((a, b) => dateOf(a) - dateOf(b));
    else if (sort === "ativos") out = [...out].sort((a, b) => (a.subscription.status === "ativa" ? -1 : 1) - (b.subscription.status === "ativa" ? -1 : 1));
    else if (sort === "vencidos") out = [...out].sort((a, b) => (a.subscription.status === "vencida" ? -1 : 1) - (b.subscription.status === "vencida" ? -1 : 1));
    return out;
  }, [rows, search, status, planFilter, dateFrom, dateTo, sort]);

  const stats = useMemo(() => {
    const total = rows.length;
    let ativos = 0, vencidos = 0, cancelados = 0, receita = 0;
    for (const r of rows) {
      const st = r.subscription.status;
      if (st === "ativa") { ativos++; receita += r.subscription.price_cents; }
      else if (st === "vencida") vencidos++;
      else if (st === "cancelada") cancelados++;
    }
    return { total, ativos, vencidos, cancelados, receita };
  }, [rows]);

  if (adminLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Verificando permissões…
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-2">
          <ShieldCheck className="size-10 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-semibold">Acesso restrito</h2>
          <p className="text-sm text-muted-foreground">Apenas administradores podem acessar esta área.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assinantes"
        description="Gerencie todos os usuários que assinam o sistema."
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Total" value={stats.total} icon={UsersIcon} color="violet" />
        <KpiCard label="Ativos" value={stats.ativos} icon={BadgeCheck} color="emerald" />
        <KpiCard label="Vencidos" value={stats.vencidos} icon={AlertTriangle} color="amber" />
        <KpiCard label="Cancelados" value={stats.cancelados} icon={Ban} color="rose" />
        <KpiCard label="Receita mensal est." value={brl(stats.receita)} icon={DollarSign} color="cyan" />
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2 relative">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou e-mail…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="ativa">Ativa</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
                <SelectItem value="vencida">Vencida</SelectItem>
                <SelectItem value="teste_gratis">Teste grátis</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger><SelectValue placeholder="Plano" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os planos</SelectItem>
                {plansOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger><SelectValue placeholder="Ordenar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recentes">Mais recentes</SelectItem>
                <SelectItem value="antigos">Mais antigos</SelectItem>
                <SelectItem value="ativos">Ativos primeiro</SelectItem>
                <SelectItem value="vencidos">Vencidos primeiro</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2 lg:col-span-1">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-auto">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">Nenhum assinante encontrado.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  
                  <TableHead>Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assinou em</TableHead>
                  <TableHead>Vence em</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Pagamento</TableHead>
                  
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.user_id}>
                    <TableCell>
                      <div className="font-medium truncate max-w-[180px]">{r.full_name || "—"}</div>
                      {r.company_name && <div className="text-xs text-muted-foreground truncate max-w-[180px]">{r.company_name}</div>}
                    </TableCell>
                    <TableCell>{r.subscription.plan_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell><StatusBadge status={r.subscription.status} /></TableCell>
                    <TableCell className="text-sm">{r.subscription.started_at ? formatDateBR(r.subscription.started_at) : "—"}</TableCell>
                    <TableCell className="text-sm">{r.subscription.current_period_end ? formatDateBR(r.subscription.current_period_end) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(r.subscription.price_cents)}</TableCell>
                    <TableCell className="text-sm capitalize">{r.subscription.payment_method ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setRenewTarget(r)} title="Renovar">
                          <RefreshCw className="size-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => navigate({ to: "/admin/assinantes/$id", params: { id: r.user_id } })} title="Editar">
                          <Pencil className="size-4" />
                        </Button>
                        <Button size="sm" variant="outline" className="text-rose-400 hover:text-rose-300" onClick={() => setDeleteTarget(r)} title="Excluir">
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!renewTarget} onOpenChange={(o) => !o && setRenewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renovar assinatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {renewTarget?.full_name || renewTarget?.email}
            </p>
            <div>
              <Label>Dias a adicionar</Label>
              <Input
                type="number"
                min={1}
                value={renewDays}
                onChange={(e) => setRenewDays(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewTarget(null)}>Cancelar</Button>
            <Button onClick={() => renewMut.mutate()} disabled={renewMut.isPending || !Number(renewDays)}>
              {renewMut.isPending && <Loader2 className="size-4 mr-1 animate-spin" />}
              Renovar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir assinante?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá a conta de <strong>{deleteTarget?.full_name || deleteTarget?.email}</strong> permanentemente, incluindo todos os dados vinculados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={(e) => { e.preventDefault(); deleteMut.mutate(); }}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending && <Loader2 className="size-4 mr-1 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
