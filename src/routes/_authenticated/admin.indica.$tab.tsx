import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Gift, Users, UserCheck, DollarSign, Wallet, CalendarRange, QrCode, Trophy, Sliders,
  MousePointerClick, Search, Plus, RefreshCw, Copy, Check, ExternalLink, ArrowRight,
  TrendingUp, CheckCircle2, Clock, AlertTriangle, Filter, ChevronRight, FileSpreadsheet,
  Download, Send, Edit, Trash2, Key, Info, HelpCircle, Loader2
} from "lucide-react";

import {
  getIndicaOverviewStatsFn,
  listPartnersFn,
  savePartnerFn,
  deletePartnerFn,
  listCommissionsFn,
  listReferredClientsFn,
  listWeeklyClosingsFn,
  generateWeeklyClosingsFn,
  markClosingPaidFn,
  listPartnerWalletTransactionsFn,
  getPartnerRankingFn,
  getIndicaSettingsFn,
  updateIndicaSettingsFn,
  listPartnerClicksFn,
} from "@/lib/ajp-indica.functions";
import type { Partner, PartnerCommission, PartnerWeeklyClosing } from "@/lib/ajp-indica.types";
import { getCycleForDate, getMonthlyClosingCycles } from "@/lib/partner-closings";
import { brl, formatDateBR, formatPhone } from "@/lib/format";
import { translateError } from "@/lib/translate-error";

import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin/indica/$tab")({
  head: () => ({ meta: [{ title: "AJP INDICA — Painel VIP" }] }),
  component: AdminIndicaPage,
});

const SUBMENUS = [
  { key: "visao-geral", label: "Visão geral", icon: Gift },
  { key: "indicadores", label: "Indicadores", icon: Users },
  { key: "indicacoes", label: "Indicações", icon: MousePointerClick },
  { key: "clientes", label: "Clientes indicados", icon: UserCheck },
  { key: "comissoes", label: "Comissões", icon: DollarSign },
  { key: "carteiras", label: "Carteiras", icon: Wallet },
  { key: "fechamentos", label: "Fechamentos semanais", icon: CalendarRange },
  { key: "pagamentos", label: "Pagamentos Pix", icon: QrCode },
  { key: "ranking", label: "Ranking", icon: Trophy },
  { key: "configuracoes", label: "Configurações", icon: Sliders },
] as const;

function AdminIndicaPage() {
  const params = Route.useParams();
  const currentTab = params.tab || "visao-geral";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const handleTabChange = (key: string) => {
    navigate({ to: "/admin/indica/$tab", params: { tab: key } });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AJP INDICA"
        description="Módulo oficial de afiliados e indicações com comissões automáticas no Mercado Pago."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => qc.invalidateQueries()}
              className="text-zinc-300 border-zinc-800 hover:bg-zinc-900"
            >
              <RefreshCw className="size-3.5 mr-1.5" />
              Atualizar dados
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-[#FF5500] hover:bg-[#E04B00] text-white font-semibold shadow-md shadow-orange-500/20"
            >
              <Link to="/parceiro" target="_blank">
                <ExternalLink className="size-3.5 mr-1.5" />
                Portal do Indicador
              </Link>
            </Button>
          </div>
        }
      />

      {/* Navegação por Submenus / Abas */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-zinc-800/80">
        {SUBMENUS.map((item) => {
          const isActive = currentTab === item.key;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => handleTabChange(item.key)}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs md:text-sm font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                isActive
                  ? "bg-[#FF5500] text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Conteúdo Dinâmico por Submenu */}
      {currentTab === "visao-geral" && <VisaoGeralSection />}
      {currentTab === "indicadores" && <IndicadoresSection />}
      {currentTab === "indicacoes" && <IndicacoesSection />}
      {currentTab === "clientes" && <ClientesIndicadosSection />}
      {currentTab === "comissoes" && <ComissoesSection />}
      {currentTab === "carteiras" && <CarteirasSection />}
      {currentTab === "fechamentos" && <FechamentosSection />}
      {currentTab === "pagamentos" && <PagamentosPixSection />}
      {currentTab === "ranking" && <RankingSection />}
      {currentTab === "configuracoes" && <ConfiguracoesSection />}
    </div>
  );
}

// =============================================================================
// 1. VISÃO GERAL
// =============================================================================
function VisaoGeralSection() {
  const getStats = useServerFn(getIndicaOverviewStatsFn);
  const { data: stats, isLoading } = useQuery({
    queryKey: ["indica", "overview-stats"],
    queryFn: () => getStats(),
  });

  const now = new Date();
  const currentCycle = getCycleForDate(now);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://ajpvip.com.br";
  const defaultRefLink = `${baseUrl}/portal?ref=AJP0001`;

  const copyRefLink = () => {
    navigator.clipboard.writeText(defaultRefLink);
    toast.success("Link padrão de indicação copiado!");
  };

  return (
    <div className="space-y-6">
      {/* Alerta do Ciclo Semanal Atual */}
      <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-lg bg-[#FF5500]/20 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0">
            <CalendarRange className="size-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-100">{currentCycle.label}</h4>
            <p className="text-xs text-zinc-400">
              Período ativo para apuração de comissões. Pagamento previsto para dia {formatDateBR(currentCycle.paymentDueDate)}.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="border-orange-500/40 text-orange-400 bg-orange-500/20 text-xs py-1">
          Ciclo {currentCycle.cycleNumber} em andamento
        </Badge>
      </div>

      {/* Grid de KPIs Administrativos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total de Parceiros"
          value={isLoading ? "..." : stats?.totalPartners ?? 0}
          icon={Users}
          color="primary"
          hint={`${stats?.activePartners ?? 0} ativos`}
        />
        <KpiCard
          label="Clientes Indicados"
          value={isLoading ? "..." : stats?.totalReferredClients ?? 0}
          icon={UserCheck}
          color="emerald"
          hint={`${stats?.activeReferredClients ?? 0} com plano ativo`}
        />
        <KpiCard
          label="Receita Recorrente (MRR)"
          value={isLoading ? "..." : brl(stats?.mrrReferredCents ?? 0)}
          icon={TrendingUp}
          color="cyan"
          hint="Gerada por indicações"
        />
        <KpiCard
          label="Comissões Pagas"
          value={isLoading ? "..." : brl(stats?.commissionsPaidCents ?? 0)}
          icon={CheckCircle2}
          color="emerald"
          hint="Liquidadas via Pix"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          label="Total de Comissões Geradas"
          value={isLoading ? "..." : brl(stats?.commissionsGeneratedCents ?? 0)}
          icon={DollarSign}
          color="violet"
          hint="R$ 20 por nova assinatura"
        />
        <KpiCard
          label="Comissões Pendentes"
          value={isLoading ? "..." : brl(stats?.commissionsPendingCents ?? 0)}
          icon={Clock}
          color="amber"
          hint="Aguardando fechamento semanal"
        />
        <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md p-4 flex flex-col justify-between">
          <div>
            <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Link de Exemplo</div>
            <p className="text-xs text-zinc-300 mt-1 truncate font-mono bg-zinc-950/70 p-2 rounded-lg border border-zinc-800">
              {defaultRefLink}
            </p>
          </div>
          <Button
            size="sm"
            onClick={copyRefLink}
            variant="outline"
            className="w-full mt-3 border-zinc-700 text-zinc-200 hover:bg-zinc-800"
          >
            <Copy className="size-3.5 mr-1.5" />
            Copiar Link Modelo
          </Button>
        </Card>
      </div>

      {/* Regras do Programa */}
      <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-zinc-100 flex items-center gap-2">
            <Info className="size-4 text-[#FF5500]" />
            Regras Automáticas do Módulo AJP INDICA
          </CardTitle>
          <CardDescription className="text-xs text-zinc-400">
            Regras estritas aplicadas na validação via servidor e webhooks do Mercado Pago.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-zinc-300">
            <div className="p-3 rounded-lg bg-zinc-950/50 border border-zinc-800">
              <span className="font-semibold text-emerald-400 block mb-1">✓ 1ª Assinatura Única</span>
              Comissão de R$ 20,00 gerada exclusivamente na primeira assinatura paga do novo cliente.
            </div>
            <div className="p-3 rounded-lg bg-zinc-950/50 border border-zinc-800">
              <span className="font-semibold text-orange-400 block mb-1">✕ Renovações Não Geram</span>
              Renovações subsequentes mantêm a receita do lojista sem gerar novas cobranças de comissão.
            </div>
            <div className="p-3 rounded-lg bg-zinc-950/50 border border-zinc-800">
              <span className="font-semibold text-sky-400 block mb-1">✓ Fechamento Semanal</span>
              Fechamentos apurados por ciclos de 7 dias com liquidação programada via Pix.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// 2. INDICADORES (PARCEIROS)
// =============================================================================
function IndicadoresSection() {
  const listPartners = useServerFn(listPartnersFn);
  const savePartner = useServerFn(savePartnerFn);
  const deletePartner = useServerFn(deletePartnerFn);
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState("cpf");
  const [status, setStatus] = useState<"ativo" | "inativo" | "bloqueado">("ativo");
  const [notes, setNotes] = useState("");

  const { data: partners, isLoading } = useQuery({
    queryKey: ["indica", "partners", search],
    queryFn: () => listPartners({ data: { search } }),
  });

  const openNew = () => {
    setEditing(null);
    setName("");
    setEmail("");
    setPhone("");
    // Gera próximo código sugestivo
    const nextNum = (partners?.length ?? 0) + 1;
    setCode(`AJP${String(nextNum).padStart(4, "0")}`);
    setPixKey("");
    setPixKeyType("cpf");
    setStatus("ativo");
    setNotes("");
    setModalOpen(true);
  };

  const openEdit = (p: Partner) => {
    setEditing(p);
    setName(p.name);
    setEmail(p.email);
    setPhone(p.phone);
    setCode(p.code);
    setPixKey(p.pix_key || "");
    setPixKeyType((p.pix_key_type as any) || "cpf");
    setStatus(p.status);
    setNotes(p.notes || "");
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      return await savePartner({
        data: {
          id: editing?.id,
          name,
          email,
          phone,
          code,
          pix_key: pixKey,
          pix_key_type: pixKeyType,
          status,
          notes,
        },
      });
    },
    onSuccess: () => {
      toast.success(editing ? "Indicador atualizado" : "Indicador cadastrado com sucesso");
      qc.invalidateQueries({ queryKey: ["indica"] });
      setModalOpen(false);
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await deletePartner({ data: { id } });
    },
    onSuccess: () => {
      toast.success("Indicador removido");
      qc.invalidateQueries({ queryKey: ["indica"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const copyLink = (pCode: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://ajpvip.com.br";
    const link = `${origin}/portal?ref=${pCode}`;
    navigator.clipboard.writeText(link);
    toast.success(`Link de ${pCode} copiado!`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
          <Input
            placeholder="Buscar por nome, código, e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-zinc-900 border-zinc-800 text-sm"
          />
        </div>
        <Button onClick={openNew} className="bg-[#FF5500] hover:bg-[#E04B00] text-white w-full sm:w-auto">
          <Plus className="size-4 mr-1.5" />
          Novo Indicador
        </Button>
      </div>

      <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800/80 hover:bg-transparent">
              <TableHead className="text-zinc-400">Código</TableHead>
              <TableHead className="text-zinc-400">Nome / Contato</TableHead>
              <TableHead className="text-zinc-400">Chave Pix</TableHead>
              <TableHead className="text-zinc-400 text-right">Saldo Carteira</TableHead>
              <TableHead className="text-zinc-400 text-right">Total Ganho</TableHead>
              <TableHead className="text-zinc-400 text-center">Status</TableHead>
              <TableHead className="text-zinc-400 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-zinc-500">
                  <Loader2 className="size-5 animate-spin mx-auto mb-2 text-primary" />
                  Carregando indicadores...
                </TableCell>
              </TableRow>
            ) : partners?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-zinc-500">
                  Nenhum indicador cadastrado. Clique em "Novo Indicador" para começar.
                </TableCell>
              </TableRow>
            ) : (
              partners?.map((p) => (
                <TableRow key={p.id} className="border-zinc-800/60 hover:bg-zinc-800/30">
                  <TableCell className="font-mono font-bold text-orange-400">
                    {p.code}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-zinc-100">{p.name}</div>
                    <div className="text-xs text-zinc-400">{p.email} • {formatPhone(p.phone)}</div>
                  </TableCell>
                  <TableCell>
                    {p.pix_key ? (
                      <div>
                        <span className="text-xs font-mono text-zinc-300">{p.pix_key}</span>
                        <span className="text-[10px] text-zinc-500 block uppercase">{p.pix_key_type}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-500 italic">Não cadastrada</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-emerald-400">
                    {brl(p.balance_cents)}
                  </TableCell>
                  <TableCell className="text-right text-zinc-300">
                    {brl(p.total_earned_cents)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className={
                        p.status === "ativo"
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                      }
                    >
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => copyLink(p.code)}
                        title="Copiar Link de Indicação"
                        className="size-8 text-zinc-400 hover:text-white hover:bg-zinc-800"
                      >
                        <Copy className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(p)}
                        title="Editar"
                        className="size-8 text-zinc-400 hover:text-white hover:bg-zinc-800"
                      >
                        <Edit className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Remover indicador ${p.name}?`)) {
                            deleteMutation.mutate(p.id);
                          }
                        }}
                        title="Remover"
                        className="size-8 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Modal de Criação / Edição de Indicador */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">
              {editing ? "Editar Indicador" : "Cadastrar Novo Indicador"}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              Configure os dados do parceiro e sua chave Pix para repasses semanais.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-300">Código Exclusivo</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Ex: AJP0001"
                  className="font-mono uppercase font-bold text-orange-400 bg-zinc-900 border-zinc-800"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-300">Status</Label>
                <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                    <SelectItem value="bloqueado">Bloqueado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-300">Nome Completo</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Carlos Silva"
                className="bg-zinc-900 border-zinc-800"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-300">E-mail</Label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="parceiro@email.com"
                  type="email"
                  className="bg-zinc-900 border-zinc-800"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-300">WhatsApp / Telefone</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="bg-zinc-900 border-zinc-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-300">Tipo Pix</Label>
                <Select value={pixKeyType} onValueChange={setPixKeyType}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="cnpj">CNPJ</SelectItem>
                    <SelectItem value="telefone">Telefone</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="aleatoria">Aleatória</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs text-zinc-300">Chave Pix para Recebimento</Label>
                <Input
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder="Chave Pix"
                  className="bg-zinc-900 border-zinc-800 font-mono text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-300">Observações Internas (Opcional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Canal de divulgação, rede de contatos..."
                className="bg-zinc-900 border-zinc-800 text-xs resize-none h-16"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalOpen(false)} className="text-zinc-400">
              Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !name || !email || !code}
              className="bg-[#FF5500] hover:bg-[#E04B00] text-white"
            >
              {saveMutation.isPending ? "Salvando..." : "Salvar Indicador"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================================
// 3. INDICAÇÕES (LOG DE CLIQUES E VISITAS)
// =============================================================================
function IndicacoesSection() {
  const listClicks = useServerFn(listPartnerClicksFn);
  const { data: clicks, isLoading } = useQuery({
    queryKey: ["indica", "clicks"],
    queryFn: () => listClicks(),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Log de Tráfego e Conversões</h3>
          <p className="text-xs text-zinc-400">Cliques rastreados através dos links ?ref= dos indicadores</p>
        </div>
      </div>

      <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800/80 hover:bg-transparent">
              <TableHead className="text-zinc-400">Data e Hora</TableHead>
              <TableHead className="text-zinc-400">Indicador</TableHead>
              <TableHead className="text-zinc-400">IP de Origem</TableHead>
              <TableHead className="text-zinc-400">Dispositivo / Navegador</TableHead>
              <TableHead className="text-zinc-400 text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-zinc-500">
                  Carregando log de indicações...
                </TableCell>
              </TableRow>
            ) : clicks?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-zinc-500">
                  Nenhum clique registrado ainda. Os cliques aparecerão aqui quando os links forem acessados.
                </TableCell>
              </TableRow>
            ) : (
              clicks?.map((c: any) => (
                <TableRow key={c.id} className="border-zinc-800/60 hover:bg-zinc-800/30">
                  <TableCell className="text-xs text-zinc-300">
                    {new Date(c.created_at).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold text-zinc-100">{c.partner?.name || "—"}</span>
                    <span className="text-xs font-mono text-orange-400 ml-2">({c.partner?.code})</span>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-zinc-400">
                    {c.ip || "—"}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-400 max-w-[200px] truncate" title={c.user_agent}>
                    {c.user_agent || "Desconhecido"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="bg-sky-500/10 text-sky-400 border-sky-500/20 text-xs">
                      Rastreado
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// =============================================================================
// 4. CLIENTES INDICADOS
// =============================================================================
function ClientesIndicadosSection() {
  const listClients = useServerFn(listReferredClientsFn);
  const { data: clients, isLoading } = useQuery({
    queryKey: ["indica", "referred-clients"],
    queryFn: () => listClients({ data: {} }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Base de Clientes Originados por Indicação</h3>
          <p className="text-xs text-zinc-400">Clientes vinculados a parceiros oficiais do programa AJP INDICA</p>
        </div>
      </div>

      <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800/80 hover:bg-transparent">
              <TableHead className="text-zinc-400">Cliente</TableHead>
              <TableHead className="text-zinc-400">Indicado por</TableHead>
              <TableHead className="text-zinc-400">Vencimento</TableHead>
              <TableHead className="text-zinc-400 text-right">Valor Mensal</TableHead>
              <TableHead className="text-zinc-400 text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-zinc-500">
                  Carregando clientes indicados...
                </TableCell>
              </TableRow>
            ) : clients?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-zinc-500">
                  Nenhum cliente cadastrado via indicação ainda.
                </TableCell>
              </TableRow>
            ) : (
              clients?.map((c: any) => (
                <TableRow key={c.id} className="border-zinc-800/60 hover:bg-zinc-800/30">
                  <TableCell>
                    <div className="font-medium text-zinc-100">{c.name}</div>
                    <div className="text-xs text-zinc-400">{formatPhone(c.phone)}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium text-zinc-200">{c.partner?.name || "Parceiro"}</div>
                    <Badge variant="outline" className="font-mono text-[10px] border-orange-500/30 text-orange-400 bg-orange-500/10">
                      {c.partner?.code || c.partner_code || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-zinc-300">
                    {formatDateBR(c.due_date)}
                  </TableCell>
                  <TableCell className="text-right font-medium text-zinc-200">
                    {brl(c.price_cents)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className={
                        c.status === "ativo"
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                      }
                    >
                      {c.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// =============================================================================
// 5. COMISSÕES
// =============================================================================
function ComissoesSection() {
  const listCommissions = useServerFn(listCommissionsFn);
  const [statusFilter, setStatusFilter] = useState("todos");

  const { data: commissions, isLoading } = useQuery({
    queryKey: ["indica", "commissions", statusFilter],
    queryFn: () => listCommissions({ data: { status: statusFilter } }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Histórico de Comissões de R$ 20,00</h3>
          <p className="text-xs text-zinc-400">Comissões aprovadas automaticamente na confirmação da 1ª assinatura</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 bg-zinc-900 border-zinc-800 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="aprovada">Aprovadas</SelectItem>
            <SelectItem value="paga">Pagas</SelectItem>
            <SelectItem value="pendente">Pendentes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800/80 hover:bg-transparent">
              <TableHead className="text-zinc-400">Data Aprovação</TableHead>
              <TableHead className="text-zinc-400">Indicador</TableHead>
              <TableHead className="text-zinc-400">Cliente Novo</TableHead>
              <TableHead className="text-zinc-400">Mercado Pago ID</TableHead>
              <TableHead className="text-zinc-400 text-right">Valor Comissão</TableHead>
              <TableHead className="text-zinc-400 text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-zinc-500">
                  Carregando comissões...
                </TableCell>
              </TableRow>
            ) : commissions?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-zinc-500">
                  Nenhuma comissão encontrada para este filtro.
                </TableCell>
              </TableRow>
            ) : (
              commissions?.map((c) => (
                <TableRow key={c.id} className="border-zinc-800/60 hover:bg-zinc-800/30">
                  <TableCell className="text-xs text-zinc-300">
                    {new Date(c.created_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold text-zinc-100">{c.partner?.name || "—"}</span>
                    <span className="text-xs font-mono text-orange-400 ml-1.5">({c.partner?.code})</span>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-zinc-200">{c.client?.name || "Cliente"}</div>
                    <div className="text-xs text-zinc-500">{formatPhone(c.client?.phone || "")}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-zinc-400">
                    {c.mp_payment_id || "—"}
                  </TableCell>
                  <TableCell className="text-right font-bold text-emerald-400">
                    {brl(c.amount_cents)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className={
                        c.status === "paga"
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : c.status === "aprovada"
                          ? "bg-sky-500/15 text-sky-400 border-sky-500/30"
                          : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                      }
                    >
                      {c.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// =============================================================================
// 6. CARTEIRAS E EXTRATOS
// =============================================================================
function CarteirasSection() {
  const listPartners = useServerFn(listPartnersFn);
  const listTransactions = useServerFn(listPartnerWalletTransactionsFn);

  const { data: partners, isLoading: loadingPartners } = useQuery({
    queryKey: ["indica", "partners-wallets"],
    queryFn: () => listPartners({ data: {} }),
  });

  const { data: transactions, isLoading: loadingTx } = useQuery({
    queryKey: ["indica", "wallet-transactions"],
    queryFn: () => listTransactions({ data: {} }),
  });

  return (
    <div className="space-y-6">
      {/* Resumo de Saldos por Parceiro */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-100 mb-3">Saldos Disponíveis dos Indicadores</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {partners?.map((p) => (
            <div key={p.id} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-md">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-zinc-100 truncate">{p.name}</span>
                <Badge variant="outline" className="font-mono text-[10px] text-orange-400 border-orange-500/30">
                  {p.code}
                </Badge>
              </div>
              <div className="flex items-baseline justify-between mt-3">
                <span className="text-xs text-zinc-400">Saldo Disponível:</span>
                <span className="text-xl font-bold text-emerald-400">{brl(p.balance_cents)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-500 mt-1">
                <span>Total já sacado:</span>
                <span>{brl(p.total_withdrawn_cents)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Extrato de Movimentações */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-100 mb-3">Extrato Geral de Movimentações</h3>
        <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800/80 hover:bg-transparent">
                <TableHead className="text-zinc-400">Data</TableHead>
                <TableHead className="text-zinc-400">Tipo</TableHead>
                <TableHead className="text-zinc-400">Descrição</TableHead>
                <TableHead className="text-zinc-400 text-right">Valor</TableHead>
                <TableHead className="text-zinc-400 text-right">Saldo Resultante</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingTx ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-zinc-500">
                    Carregando extrato...
                  </TableCell>
                </TableRow>
              ) : transactions?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-zinc-500">
                    Nenhuma movimentação registrada na carteira ainda.
                  </TableCell>
                </TableRow>
              ) : (
                transactions?.map((t) => (
                  <TableRow key={t.id} className="border-zinc-800/60 hover:bg-zinc-800/30">
                    <TableCell className="text-xs text-zinc-300">
                      {new Date(t.created_at).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          t.amount_cents > 0
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs"
                            : "bg-orange-500/15 text-orange-400 border-orange-500/30 text-xs"
                        }
                      >
                        {t.type === "comissao_creditada" ? "+ Comissão" : "- Saque Pix"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-zinc-200">
                      {t.description}
                    </TableCell>
                    <TableCell className={`text-right font-bold ${t.amount_cents > 0 ? "text-emerald-400" : "text-orange-400"}`}>
                      {t.amount_cents > 0 ? `+${brl(t.amount_cents)}` : brl(t.amount_cents)}
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono text-zinc-300">
                      {brl(t.balance_after_cents)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

// =============================================================================
// 7. FECHAMENTOS SEMANAIS (CALENDÁRIO OFICIAL)
// =============================================================================
function FechamentosSection() {
  const listClosings = useServerFn(listWeeklyClosingsFn);
  const generateClosings = useServerFn(generateWeeklyClosingsFn);
  const qc = useQueryClient();

  const now = new Date();
  const currentMonthCycles = getMonthlyClosingCycles(now.getFullYear(), now.getMonth() + 1);

  const { data: closings, isLoading } = useQuery({
    queryKey: ["indica", "weekly-closings"],
    queryFn: () => listClosings({ data: {} }),
  });

  const generateMutation = useMutation({
    mutationFn: async (cycleNum: number) => {
      return await generateClosings({
        data: {
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          cycleNumber: cycleNum,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`${res.createdCount} fechamento(s) apurado(s) com sucesso!`);
      qc.invalidateQueries({ queryKey: ["indica"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  return (
    <div className="space-y-6">
      {/* Calendário Oficial */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-100 mb-2">Calendário Oficial de Fechamento Semanal</h3>
        <p className="text-xs text-zinc-400 mb-4">
          Regra: 01 a 07 (paga 08) | 08 a 14 (paga 15) | 15 a 21 (paga 22) | 22 a 28 (paga 29) | 29 ao fim (paga 01 seguinte)
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {currentMonthCycles.map((c) => (
            <div
              key={c.cycleNumber}
              className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-md flex flex-col justify-between"
            >
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-orange-400 block">
                  Ciclo {c.cycleNumber}
                </span>
                <div className="text-xs font-semibold text-zinc-200 mt-1">
                  {c.periodStart.slice(8)} a {c.periodEnd.slice(8)} de {c.periodStart.slice(5, 7)}
                </div>
                <div className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1">
                  <Clock className="size-3 text-emerald-400" />
                  Paga dia: <strong className="text-emerald-400">{c.paymentDueDate.slice(8)}/{c.paymentDueDate.slice(5, 7)}</strong>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => generateMutation.mutate(c.cycleNumber)}
                disabled={generateMutation.isPending}
                className="w-full mt-3 text-xs border-zinc-700 hover:bg-zinc-800 text-zinc-200"
              >
                Apurar Ciclo {c.cycleNumber}
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Tabela de Fechamentos Gerados */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-100 mb-3">Lotes de Fechamento Gerados</h3>
        <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800/80 hover:bg-transparent">
                <TableHead className="text-zinc-400">Ciclo / Período</TableHead>
                <TableHead className="text-zinc-400">Indicador</TableHead>
                <TableHead className="text-zinc-400">Data Pagamento</TableHead>
                <TableHead className="text-zinc-400 text-center">Comissões</TableHead>
                <TableHead className="text-zinc-400 text-right">Total a Pagar</TableHead>
                <TableHead className="text-zinc-400 text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-zinc-500">
                    Carregando fechamentos...
                  </TableCell>
                </TableRow>
              ) : closings?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-zinc-500">
                    Nenhum fechamento semanal gerado ainda. Clique em "Apurar Ciclo" acima para gerar.
                  </TableCell>
                </TableRow>
              ) : (
                closings?.map((cl) => (
                  <TableRow key={cl.id} className="border-zinc-800/60 hover:bg-zinc-800/30">
                    <TableCell>
                      <div className="font-semibold text-zinc-200">Ciclo {cl.cycle_number}</div>
                      <div className="text-xs text-zinc-400">{formatDateBR(cl.period_start)} até {formatDateBR(cl.period_end)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-zinc-100">{cl.partner?.name || "—"}</div>
                      <div className="text-xs font-mono text-orange-400">{cl.partner?.code}</div>
                    </TableCell>
                    <TableCell className="text-sm font-semibold text-emerald-400">
                      {formatDateBR(cl.payment_due_date)}
                    </TableCell>
                    <TableCell className="text-center text-zinc-300 font-bold">
                      {cl.commissions_count}
                    </TableCell>
                    <TableCell className="text-right font-bold text-lg text-emerald-400">
                      {brl(cl.total_cents)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={
                          cl.status === "pago"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                        }
                      >
                        {cl.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

// =============================================================================
// 8. PAGAMENTOS PIX (LIQUIDAÇÃO)
// =============================================================================
function PagamentosPixSection() {
  const listClosings = useServerFn(listWeeklyClosingsFn);
  const markPaid = useServerFn(markClosingPaidFn);
  const qc = useQueryClient();

  const [txIdMap, setTxIdMap] = useState<Record<string, string>>({});

  const { data: closings, isLoading } = useQuery({
    queryKey: ["indica", "weekly-closings-pix"],
    queryFn: () => listClosings({ data: { status: "aberto" } }),
  });

  const payMutation = useMutation({
    mutationFn: async ({ id, txId }: { id: string; txId?: string }) => {
      return await markPaid({ data: { closingId: id, pixTransactionId: txId } });
    },
    onSuccess: () => {
      toast.success("Pagamento registrado com sucesso!");
      qc.invalidateQueries({ queryKey: ["indica"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const copyPixKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("Chave Pix copiada!");
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-100">Painel Operacional de Repasses Pix</h3>
        <p className="text-xs text-zinc-400">Copie a chave Pix do parceiro, realize a transferência e marque como pago.</p>
      </div>

      <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800/80 hover:bg-transparent">
              <TableHead className="text-zinc-400">Indicador</TableHead>
              <TableHead className="text-zinc-400">Chave Pix</TableHead>
              <TableHead className="text-zinc-400">Data Prevista</TableHead>
              <TableHead className="text-zinc-400 text-right">Valor Pix</TableHead>
              <TableHead className="text-zinc-400">Código/Comprovante</TableHead>
              <TableHead className="text-zinc-400 text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-zinc-500">
                  Carregando pagamentos pendentes...
                </TableCell>
              </TableRow>
            ) : closings?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-emerald-400 font-medium">
                  ✓ Não há fechamentos pendentes de pagamento Pix. Todos os repasses estão em dia!
                </TableCell>
              </TableRow>
            ) : (
              closings?.map((cl) => (
                <TableRow key={cl.id} className="border-zinc-800/60 hover:bg-zinc-800/30">
                  <TableCell>
                    <div className="font-semibold text-zinc-100">{cl.partner?.name}</div>
                    <div className="text-xs font-mono text-orange-400">{cl.partner?.code}</div>
                  </TableCell>
                  <TableCell>
                    {cl.pix_key ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-zinc-200 select-all bg-zinc-950 px-2 py-1 rounded border border-zinc-800">
                          {cl.pix_key}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => copyPixKey(cl.pix_key!)}
                          title="Copiar Chave Pix"
                          className="size-7 text-zinc-400 hover:text-white"
                        >
                          <Copy className="size-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-rose-400 italic">Chave não cadastrada</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm font-semibold text-zinc-200">
                    {formatDateBR(cl.payment_due_date)}
                  </TableCell>
                  <TableCell className="text-right font-bold text-lg text-emerald-400">
                    {brl(cl.total_cents)}
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="ID / Comprovante Pix"
                      value={txIdMap[cl.id] || ""}
                      onChange={(e) => setTxIdMap({ ...txIdMap, [cl.id]: e.target.value })}
                      className="h-8 bg-zinc-950 border-zinc-800 text-xs font-mono"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      onClick={() => payMutation.mutate({ id: cl.id, txId: txIdMap[cl.id] })}
                      disabled={payMutation.isPending}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs"
                    >
                      <Check className="size-3.5 mr-1" />
                      Marcar Pago
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// =============================================================================
// 9. RANKING DOS PARCEIROS
// =============================================================================
function RankingSection() {
  const getRanking = useServerFn(getPartnerRankingFn);
  const { data: ranking, isLoading } = useQuery({
    queryKey: ["indica", "ranking"],
    queryFn: () => getRanking(),
  });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-100">Classificação dos Indicadores</h3>
        <p className="text-xs text-zinc-400">Indicadores ordenados por receita de comissão acumulada e clientes ativos</p>
      </div>

      <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800/80 hover:bg-transparent">
              <TableHead className="text-zinc-400 w-16 text-center">Posição</TableHead>
              <TableHead className="text-zinc-400">Indicador</TableHead>
              <TableHead className="text-zinc-400 text-center">Clientes Ativos</TableHead>
              <TableHead className="text-zinc-400 text-center">Total Indicado</TableHead>
              <TableHead className="text-zinc-400 text-right">Ganhos Acumulados</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-zinc-500">
                  Carregando ranking...
                </TableCell>
              </TableRow>
            ) : ranking?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-zinc-500">
                  Nenhum parceiro no ranking ainda.
                </TableCell>
              </TableRow>
            ) : (
              ranking?.map((p: any) => (
                <TableRow key={p.id} className="border-zinc-800/60 hover:bg-zinc-800/30">
                  <TableCell className="text-center">
                    <span
                      className={`inline-flex items-center justify-center size-7 rounded-full text-xs font-bold ${
                        p.rank === 1
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                          : p.rank === 2
                          ? "bg-zinc-300/20 text-zinc-200 border border-zinc-400/40"
                          : p.rank === 3
                          ? "bg-amber-700/20 text-amber-500 border border-amber-700/40"
                          : "text-zinc-400"
                      }`}
                    >
                      {p.rank}º
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-zinc-100">{p.name}</div>
                    <div className="text-xs font-mono text-orange-400">{p.code}</div>
                  </TableCell>
                  <TableCell className="text-center font-bold text-emerald-400">
                    {p.activeClients}
                  </TableCell>
                  <TableCell className="text-center text-zinc-300">
                    {p.totalClients}
                  </TableCell>
                  <TableCell className="text-right font-bold text-emerald-400 text-base">
                    {brl(p.totalEarnedCents)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// =============================================================================
// 10. CONFIGURAÇÕES
// =============================================================================
function ConfiguracoesSection() {
  const getSettings = useServerFn(getIndicaSettingsFn);
  const updateSettings = useServerFn(updateIndicaSettingsFn);
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["indica", "settings"],
    queryFn: () => getSettings(),
  });

  const [commissionAmount, setCommissionAmount] = useState<string>("20,00");
  const [isEnabled, setIsEnabled] = useState(true);
  const [autoApprove, setAutoApprove] = useState(true);
  const [terms, setTerms] = useState("");
  const [loaded, setLoaded] = useState(false);

  if (settings && !loaded) {
    setCommissionAmount(((settings.commission_cents || 2000) / 100).toFixed(2).replace(".", ","));
    setIsEnabled(settings.is_enabled ?? true);
    setAutoApprove(settings.auto_approve ?? true);
    setTerms(settings.terms_text || "");
    setLoaded(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const cents = Math.round(parseFloat(commissionAmount.replace(",", ".")) * 100);
      return await updateSettings({
        data: {
          commission_cents: cents > 0 ? cents : 2000,
          is_enabled: isEnabled,
          auto_approve: autoApprove,
          terms_text: terms,
        },
      });
    },
    onSuccess: () => {
      toast.success("Configurações do AJP INDICA salvas com sucesso!");
      qc.invalidateQueries({ queryKey: ["indica"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-zinc-100">Parâmetros do Módulo AJP INDICA</h3>
        <p className="text-xs text-zinc-400">Configure os valores padrão de comissão e termos do programa.</p>
      </div>

      <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md">
        <CardContent className="space-y-5 pt-5">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div>
              <Label className="text-sm font-medium text-zinc-100">Programa AJP INDICA Ativo</Label>
              <p className="text-xs text-zinc-400">Habilita ou pausa a geração de novas comissões no sistema.</p>
            </div>
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>

          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div>
              <Label className="text-sm font-medium text-zinc-100">Aprovação Automática via Mercado Pago</Label>
              <p className="text-xs text-zinc-400">Aprova a comissão no mesmo milissegundo em que o Pix/Cartão é aprovado na API.</p>
            </div>
            <Switch checked={autoApprove} onCheckedChange={setAutoApprove} />
          </div>

          <div className="space-y-1.5 pb-4 border-b border-zinc-800">
            <Label className="text-sm font-medium text-zinc-100">Valor da Comissão por 1ª Assinatura (R$)</Label>
            <div className="relative max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">R$</span>
              <Input
                value={commissionAmount}
                onChange={(e) => setCommissionAmount(e.target.value)}
                className="pl-9 bg-zinc-950 border-zinc-800 font-mono font-bold text-zinc-100"
              />
            </div>
            <p className="text-xs text-zinc-500">Padrão: R$ 20,00 por cliente indicado (renovações não geram comissão).</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-zinc-100">Termos e Condições do Indicador</Label>
            <Textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Descreva as regras exibidas para o indicador..."
              className="bg-zinc-950 border-zinc-800 text-xs h-24 resize-none"
            />
          </div>

          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="bg-[#FF5500] hover:bg-[#E04B00] text-white font-bold w-full sm:w-auto"
          >
            {saveMutation.isPending ? "Salvando..." : "Salvar Configurações"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
