import React, { Component, type ReactNode, useMemo, useState } from "react";
import { EvolutionPortalCard } from "@/components/portal/evolution-portal-card";
import { ServerOverviewCards } from "@/components/portal/server-overview-cards";
import { dueThisMonth, serverClientsQueryOptions, type ServerClientStatusFilter } from "@/lib/server-client-summary";
import { ServerClientActions } from "@/components/portal/server-client-actions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  Coins,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Gift,
  Headphones,
  Loader2,
  Lock,
  LogOut,
  MessageCircle,
  Monitor,
  Pencil,
  PlayCircle,
  Plug,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  Save,
  Search,
  Send,
  Server as ServerIcon,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Trash2,
  TrendingUp,
  Tv,
  Unlock,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { PortalTab } from "@/components/portal/portal-shell";
import { brl, formatDateBR, formatDateTimeBR, parseBrlToCents, todayISO } from "@/lib/format";
import { portalFetch } from "@/lib/portal-client";
import type {
  NormalizedServerClient,
  NormalizedServerConnection,
  NormalizedServerPlan,
  CreatedServerClientResult,
  ServerTestResult,
  ServerCreditsSummary,
} from "@/lib/iptv-server-api";
import {
  buildChargeMessage,
  buildWhatsAppHref,
  handleAndroidWhatsAppIntent,
  normalizeBrPhone,
} from "@/lib/whatsapp-message";

export type AdminSubView = "home" | "loja" | "apis" | "apk" | "config" | "iptv" | "server_clients";
export type ClientFilter =
  | "todos"
  | "ativos"
  | "vencidos"
  | "vencem_hoje"
  | "a_vencer_mes"
  | "suspensos";

type AdminClientRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  iptv_login: string | null;
  iptv_password: string | null;
  plan_id: string | null;
  plan_name: string | null;
  server_id: string | null;
  server_name: string | null;
  price_cents: number;
  due_date: string;
  status: "ativo" | "vencido" | "suspenso" | "cancelado";
  computed_status: "ativo" | "vencido" | "suspenso" | "cancelado";
  due_today: boolean;
  due_this_month: boolean;
  auto_charge: boolean;
  notes: string | null;
  points: number | null;
  pwa_installed_at: string | null;
  last_login_at: string | null;
  last_device: string | null;
  login_count: number | null;
  referred_by_code?: string | null;
};

const PORTAL_MODAL_CLASS =
  "max-w-md w-[94vw] max-h-[90dvh] p-0 overflow-hidden rounded-3xl border-none shadow-2xl bg-[#F4F5F7] text-slate-900 [&>button:last-child]:hidden";
const PORTAL_LABEL_CLASS = "block text-[11px] font-bold text-slate-700 mb-1";
const PORTAL_INPUT_CLASS =
  "h-10 rounded-xl bg-slate-50 text-slate-900 placeholder:text-slate-400 border border-slate-200 px-3 text-xs font-medium shadow-none focus-visible:bg-white focus-visible:border-[#FF5500] focus-visible:ring-2 focus-visible:ring-[#FF5500]/15 [color-scheme:light]";
const PORTAL_TEXTAREA_CLASS =
  "rounded-xl bg-slate-50 text-slate-900 placeholder:text-slate-400 border border-slate-200 px-3 py-2.5 text-xs font-medium shadow-none focus-visible:bg-white focus-visible:border-[#FF5500] focus-visible:ring-2 focus-visible:ring-[#FF5500]/15 [color-scheme:light]";
const PORTAL_SELECT_CLASS =
  "w-full h-10 rounded-xl bg-slate-50 text-slate-900 border border-slate-200 px-3 text-xs font-medium outline-none focus:bg-white focus:border-[#FF5500] focus:ring-2 focus:ring-[#FF5500]/15 [color-scheme:light]";
const PORTAL_SWITCH_CLASS =
  "data-[state=checked]:bg-[#FF5500] data-[state=unchecked]:bg-slate-300 border-transparent shrink-0";

function PortalModalHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <div className="bg-gradient-to-r from-[#FF5500] to-[#E64A00] text-white px-5 py-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h3 className="font-extrabold text-base text-white tracking-tight truncate">{title}</h3>
        {subtitle && <p className="text-[11px] text-orange-50/90 truncate">{subtitle}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar janela"
        className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center shrink-0 cursor-pointer"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

type AdminPlanRow = {
  id: string;
  name: string;
  price_cents: number;
  duration_days: number;
  description?: string | null;
  active: boolean;
};

type AdminServerRow = {
  id: string;
  name: string;
  credit_cost_cents: number;
  client_count: number;
  active_count: number;
  active_accesses?: number;
  monthly_cost_cents: number;
};

type AdminStoreProduct = {
  id: string;
  key: string;
  label: string;
  sale_cents: number;
  cost_cents: number;
  duration_days: number;
  emoji: string;
  gradient: string;
  active: boolean;
  image_url: string | null;
};

type AdminSnapshot = {
  ok: boolean;
  admin: { username: string; name: string };
  today: string;
  kpis: {
    total: number;
    ativos: number;
    vencidos: number;
    suspensos: number;
    hoje: number;
    mes: number;
    pwa_installed: number;
    pwa_not_installed: number;
    pwa_pct: number;
    iptv_configured: number;
  };
  clients: AdminClientRow[];
  plans: AdminPlanRow[];
  servers: AdminServerRow[];
  store_products: AdminStoreProduct[];
  store_purchases: {
    id: string;
    product_id?: string | null;
    label: string;
    sale_cents: number;
    cost_cents: number;
    purchased_at: string;
    buyer_name: string | null;
  }[];
  finance: {
    receitaMes: number;
    despesaMes: number;
    lucroMes: number;
    lucroAno: number;
    lucroTotal: number;
    totalClientesValor: number;
    activeAccesses?: number;
    catalogBlocked?: boolean;
    paymentsCount: number;
    storeStats: { sales: number; cost: number; profit: number; count: number };
    recentEntries: {
      id: string;
      kind: "IPTV" | "Loja";
      name: string;
      date: string;
      method: string;
      amount_cents: number;
    }[];
  };
  settings: {
    whatsapp_instance: string;
    support_message: string;
    mp_access_token: string;
    telegram_bot_token: string;
    telegram_chat_id: string;
    evolution_base_url: string;
    evolution_instance_name: string;
    evolution_configured: boolean;
    iptv_server_name?: string;
    iptv_base_url?: string;
    iptv_api_configured?: boolean;
    app_android_url: string;
    app_ios_url: string;
    updates_movies_text: string;
    updates_series_text: string;
    updates_games_text: string;
    store_slug: string;
    store_title: string;
    store_description: string;
    pix_key: string;
    pix_name: string;
    pix_bank: string;
    referral_enabled: boolean;
    subscription_expires_at: string | null;
    subscription_monthly_cents: number;
  };
};

interface PortalAdminPanelProps {
  activeTab: PortalTab;
  onTabChange: (tab: PortalTab) => void;
  onLogout: () => void;
  adminName?: string;
}

function adminPost<T = any>(action: string, payload: Record<string, any> = {}) {
  return portalFetch<T>("/api/public/portal/admin", {
    method: "POST",
    body: JSON.stringify({ action, ...payload }),
  });
}

function safeConnection(c: NormalizedServerConnection): NormalizedServerConnection {
  const x = (c ?? {}) as NormalizedServerConnection;
  return {
    ...x,
    type: String(x.type ?? "iptv") as NormalizedServerConnection["type"],
    username: String(x.username ?? ""),
    channel: String(x.channel ?? "--"),
    duration: String(x.duration ?? "--"),
  };
}

export class CardErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[painel] card falhou", error);
  }
  render() {
    if (this.state.failed) {
      return this.props.fallback !== undefined ? this.props.fallback : (
        <div className="bg-white rounded-2xl p-3.5 border border-slate-100 text-xs text-slate-500">--</div>
      );
    }
    return this.props.children;
  }
}

export function PortalAdminPanel({
  activeTab,
  onTabChange,
  onLogout,
  adminName = "Administrador",
}: PortalAdminPanelProps) {
  const qc = useQueryClient();
  const [subView, setSubView] = useState<AdminSubView>("home");
  const [serverClientFilter, setServerClientFilter] = useState<ServerClientStatusFilter>("todos");
  const [clientFilter, setClientFilter] = useState<ClientFilter>("todos");
  const [clientSearch, setClientSearch] = useState("");
  const [clientFormOpen, setClientFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<AdminClientRow | null>(null);
  const [renewTarget, setRenewTarget] = useState<AdminClientRow | null>(null);
  const [onlineModalOpen, setOnlineModalOpen] = useState(false);
  const [createdServerAccess, setCreatedServerAccess] = useState<CreatedServerClientResult | null>(null);

  const onlineConnectionsQuery = useQuery({
    queryKey: ["portal", "admin", "online-connections"],
    queryFn: () =>
      adminPost<{
        ok: boolean;
        server_name: string;
        base_url: string;
        total: number;
        connections: NormalizedServerConnection[];
        error?: string;
      }>("get_online_connections")
        .then((r) => ({
          ...(r ?? {}),
          ok: Boolean(r?.ok),
          server_name: String(r?.server_name ?? ""),
          base_url: String(r?.base_url ?? ""),
          total: Number(r?.total ?? 0) || 0,
          connections: (Array.isArray(r?.connections) ? r.connections : []).map(safeConnection),
        }))
        .catch((e: unknown) => ({
          ok: false, server_name: "", base_url: "", total: 0,
          connections: [] as NormalizedServerConnection[],
          error: e instanceof Error ? e.message : "indisponível",
        })),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    staleTime: 15000,
  });

  const serverCreditsQuery = useQuery<ServerCreditsSummary>({
    queryKey: ["portal", "admin", "server-credits"],
    queryFn: () =>
      adminPost<ServerCreditsSummary>("get_server_credits")
        .then((r): ServerCreditsSummary => {
          const n = Number(r?.credits);
          return {
            ...(r ?? ({} as ServerCreditsSummary)),
            ok: Boolean(r?.ok),
            configured: Boolean(r?.configured),
            server_name: String(r?.server_name ?? ""),
            credits: Number.isFinite(n) ? n : null,
            formatted_credits:
              typeof r?.formatted_credits === "string" ? r.formatted_credits : Number.isFinite(n) ? n.toFixed(2) : "--",
            is_low_balance: Boolean(r?.is_low_balance),
          };
        })
        .catch((): ServerCreditsSummary => ({
          ok: false, configured: false, server_name: "", credits: null,
          formatted_credits: "--", is_low_balance: false,
        })),
    staleTime: 30000,
    retry: 1,
  });

  const { data, isLoading, isFetching, error, refetch } = useQuery<AdminSnapshot>({
    queryKey: ["portal", "admin", "snapshot"],
    queryFn: async () => {
      const r = await portalFetch<AdminSnapshot>("/api/public/portal/admin");
      const arr = <T,>(v: T[] | undefined | null): T[] => (Array.isArray(v) ? v : []);
      return {
        ...r,
        kpis: { ...((r?.kpis ?? {}) as AdminSnapshot["kpis"]) },
        clients: arr(r?.clients),
        servers: arr(r?.servers),
        store_products: arr(r?.store_products),
      } as AdminSnapshot;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const invalidateAdmin = () => {
    void qc.invalidateQueries({ queryKey: ["portal", "admin"] });
    void qc.invalidateQueries({ queryKey: ["portal", "me"] });
    void serverCreditsQuery.refetch();
  };

  function openClientsWithFilter(filter: ClientFilter) {
    setClientFilter(filter);
    onTabChange("clientes");
  }

  function openNewClientModal() {
    setEditingClient(null);
    setClientFormOpen(true);
  }

  function openEditClientModal(c: AdminClientRow) {
    setEditingClient(c);
    setClientFormOpen(true);
  }

  function goAdminSubView(next: AdminSubView) {
    setSubView(next);
    onTabChange("admin");
  }

  if (isLoading && !data) {
    return (
      <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF5500]" />
        <span className="text-xs font-semibold">Carregando Painel do Administrador...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-rose-100 text-center space-y-3">
        <AlertTriangle className="h-8 w-8 text-rose-500 mx-auto" />
        <h2 className="text-base font-bold text-slate-900">Falha ao carregar Área ADM</h2>
        <p className="text-xs text-slate-500">
          {(error as Error)?.message || "Verifique sua conexão e tente novamente."}
        </p>
        <div className="flex gap-2 justify-center">
          <Button size="sm" onClick={() => refetch()} className="bg-[#FF5500] hover:bg-[#E04B00] text-white">
            Tentar novamente
          </Button>
          <Button size="sm" variant="outline" onClick={onLogout}>
            Sair
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ===================================================================== */}
      {/* TAB: PAINEL ADM (MATCHEXATO DA IMAGEM + SUBMÓDULOS RÁPIDOS)           */}
      {/* ===================================================================== */}
      {activeTab === "admin" && subView === "home" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Saudação */}
          <div className="px-0.5 pt-0.5 flex items-end justify-between gap-2">
            <div>
              <p className="text-xs text-slate-500 font-medium leading-tight">Seja bem-vindo(a),</p>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
                {adminName}
              </h1>
            </div>
            <button
              type="button"
              onClick={() => {
                void refetch();
                void onlineConnectionsQuery.refetch();
                void serverCreditsQuery.refetch();
                void qc.invalidateQueries({ queryKey: ["portal", "admin", "server-clients"] });
              }}
              aria-label="Atualizar dados do painel"
              className="w-9 h-9 rounded-xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-center text-slate-600 hover:text-[#FF5500] cursor-pointer"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  isFetching || onlineConnectionsQuery.isFetching || serverCreditsQuery.isFetching
                    ? "animate-spin text-[#FF5500]"
                    : ""
                }`}
              />
            </button>
          </div>

          {/* Card Duplo: Área Administrativa Ativa + Painel do Administrador com Saldo de Créditos */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="bg-[#E3F3EB] px-4 py-2.5 flex items-center justify-between border-b border-emerald-200/50">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-700 shrink-0" />
                <span className="text-xs font-bold text-emerald-800">Área Administrativa Ativa</span>
              </div>
            </div>
            <div className="px-4 py-3.5 flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
              <div className="min-w-0">
                <h2 className="text-lg font-extrabold text-slate-900 tracking-tight leading-tight">
                  Painel do Administrador
                </h2>
                {serverCreditsQuery.data?.configured && serverCreditsQuery.data?.name && (
                  <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                    {serverCreditsQuery.data.name}
                  </p>
                )}
              </div>

              {/* Saldo de Créditos RBOYS posicionado no topo */}
              {(serverCreditsQuery.isLoading || serverCreditsQuery.data?.configured) && (
                <div
                  className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl border transition shrink-0 ${
                    serverCreditsQuery.data?.is_low_balance
                      ? "border-amber-300 bg-amber-50/80 text-amber-900"
                      : "border-slate-200/80 bg-slate-50/80 text-slate-800"
                  }`}
                  title={
                    serverCreditsQuery.data?.configured
                      ? `Saldo do servidor ${serverCreditsQuery.data.server_name || "RBOYS"}`
                      : "Carregando créditos..."
                  }
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      serverCreditsQuery.data?.is_low_balance
                        ? "bg-amber-100 text-amber-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    <Coins className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Créditos
                      </span>
                      {serverCreditsQuery.data?.is_low_balance && (
                        <span className="text-[9px] font-extrabold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded-full border border-amber-200">
                          Baixo
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-base font-black leading-none ${
                        serverCreditsQuery.data?.is_low_balance ? "text-amber-600" : "text-slate-900"
                      }`}
                    >
                      {serverCreditsQuery.isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin inline text-slate-400" />
                      ) : (
                        serverCreditsQuery.data?.formatted_credits ?? "0.00"
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <CardErrorBoundary>
            <ServerOverviewCards
              online={onlineConnectionsQuery.data?.total ?? 0}
              credits={serverCreditsQuery.data?.ok ? serverCreditsQuery.data.formatted_credits : "--"}
              onClients={(filter) => { setServerClientFilter(filter); setSubView("server_clients"); }}
              onOnline={() => setOnlineModalOpen(true)}
              onCredits={() => setSubView("apis")}
            />
          </CardErrorBoundary>

          {/* Acesso rápido (Grid 4x2 exatamente igual à imagem) */}
          <div className="space-y-2.5">
            <h3 className="text-sm font-extrabold text-slate-900 px-0.5">Acesso rápido</h3>

            <div className="grid grid-cols-4 gap-2">
              <QuickActionTile
                label="Loja"
                badgeClass="bg-violet-100/80 text-violet-600"
                icon={<ShoppingBag className="h-5 w-5" />}
                onClick={() => setSubView("loja")}
              />
              <QuickActionTile
                label="Cadastrar Cliente"
                badgeClass="bg-emerald-100/80 text-emerald-600"
                icon={<UserPlus className="h-5 w-5" />}
                onClick={openNewClientModal}
              />
              <QuickActionTile
                label="Gerenciar Clientes"
                badgeClass="bg-orange-100/80 text-orange-600"
                icon={<Users className="h-5 w-5" />}
                onClick={() => openClientsWithFilter("todos")}
              />
              <QuickActionTile
                label="CLIENTES"
                subLabel="RBOYS"
                badgeClass="bg-sky-100/80 text-sky-600"
                icon={<ServerIcon className="h-5 w-5" />}
                onClick={() => { setServerClientFilter("todos"); setSubView("server_clients"); }}
              />
              <QuickActionTile
                label="Faturamento"
                badgeClass="bg-amber-100/80 text-amber-600"
                icon={<TrendingUp className="h-5 w-5" />}
                onClick={() => onTabChange("faturas")}
              />
              <QuickActionTile
                label="API e Integrações"
                badgeClass="bg-amber-100/80 text-amber-600"
                icon={<Plug className="h-5 w-5" />}
                onClick={() => setSubView("apis")}
              />
              <QuickActionTile
                label="APK Ativo"
                badgeClass="bg-emerald-100/80 text-emerald-600"
                icon={<span className="text-[11px] font-black tracking-tighter">APK</span>}
                onClick={() => setSubView("apk")}
              />
              <QuickActionTile
                label="Configurações ADM"
                badgeClass="bg-violet-100/80 text-violet-600"
                icon={<Settings className="h-5 w-5" />}
                onClick={() => setSubView("config")}
              />
              <QuickActionTile
                label="Status do IPTV"
                badgeClass="bg-sky-100/80 text-sky-600"
                icon={<Monitor className="h-5 w-5" />}
                onClick={() => setSubView("iptv")}
              />
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUBMÓDULOS DENTRO DA ABA ADMIN                                        */}
      {/* ===================================================================== */}
      {activeTab === "admin" && subView === "loja" && (
        <AdminLojaSubView data={data} onBack={() => setSubView("home")} onChanged={invalidateAdmin} />
      )}
      {activeTab === "admin" && subView === "apis" && (
        <AdminApisSubView data={data} onBack={() => setSubView("home")} onChanged={invalidateAdmin} />
      )}
      {activeTab === "admin" && subView === "apk" && (
        <AdminApkSubView data={data} onBack={() => setSubView("home")} onChanged={invalidateAdmin} />
      )}
      {activeTab === "admin" && subView === "config" && (
        <AdminConfigSubView data={data} onBack={() => setSubView("home")} onChanged={invalidateAdmin} />
      )}
      {activeTab === "admin" && subView === "iptv" && (
        <AdminIptvSubView data={data} onBack={() => setSubView("home")} onChanged={invalidateAdmin} />
      )}
      {activeTab === "admin" && subView === "server_clients" && (
        <CardErrorBoundary fallback={<div className="p-4 text-sm text-slate-500">Servidor RBOYS indisponível no momento.</div>}>
          <AdminServerClientsSubView data={data} initialFilter={serverClientFilter} onBack={() => setSubView("home")} onChanged={invalidateAdmin} />
        </CardErrorBoundary>
      )}

      {/* ===================================================================== */}
      {/* TAB: CLIENTES (GERENCIAR CLIENTES)                                    */}
      {/* ===================================================================== */}
      {activeTab === "clientes" && (
        <AdminClientsTab
          data={data}
          filter={clientFilter}
          onFilterChange={setClientFilter}
          search={clientSearch}
          onSearchChange={setClientSearch}
          onNewClient={openNewClientModal}
          onEditClient={openEditClientModal}
          onRenewClient={setRenewTarget}
          onChanged={invalidateAdmin}
        />
      )}

      {/* ===================================================================== */}
      {/* TAB: FATURAS (FATURAMENTO & FINANCEIRO)                               */}
      {/* ===================================================================== */}
      {activeTab === "faturas" && <AdminFinanceTab data={data} />}

      {/* ===================================================================== */}
      {/* TAB: INÍCIO (VISÃO RÁPIDA ADMIN NO PORTAL)                            */}
      {/* ===================================================================== */}
      {activeTab === "inicio" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                Modo Administrador
              </p>
              <h2 className="text-base font-extrabold text-slate-900">Portal AJP VIP</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {data.kpis.ativos} ativos · {data.kpis.vencidos} vencidos ·{" "}
                {brl(data.finance.lucroMes)} lucro/mês
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => goAdminSubView("home")}
              className="bg-[#FF5500] hover:bg-[#E04B00] text-white rounded-xl font-bold shrink-0"
            >
              Painel ADM
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={openNewClientModal}
              className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-3 text-left cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <UserPlus className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-slate-900">Novo Cliente</p>
                <p className="text-[11px] text-slate-500">Cadastrar agora</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => openClientsWithFilter("vencidos")}
              className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-3 text-left cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-slate-900">Vencidos ({data.kpis.vencidos})</p>
                <p className="text-[11px] text-slate-500">Cobrar / Renovar</p>
              </div>
            </button>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                Catálogo da Loja Ativo ({data.store_products.filter((p) => p.active).length})
              </h3>
              <button
                type="button"
                onClick={() => goAdminSubView("loja")}
                className="text-xs font-bold text-[#FF5500] cursor-pointer"
              >
                Gerenciar Loja →
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {data.store_products.slice(0, 4).map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 flex items-center gap-2"
                >
                  <span className="text-lg">{p.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{p.label}</p>
                    <p className="text-[11px] font-extrabold text-[#FF5500]">{brl(p.sale_cents)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Link
            to="/dashboard"
            className="flex items-center justify-between bg-slate-900 text-white rounded-2xl p-4 shadow-sm hover:bg-slate-800 transition"
          >
            <div>
              <p className="text-xs font-extrabold">Abrir Painel Web Completo</p>
              <p className="text-[11px] text-slate-300">Acessar /dashboard com todos os módulos desktop</p>
            </div>
            <ExternalLink className="h-4 w-4 text-[#FF5500]" />
          </Link>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB: MAIS (ATALHOS ADM + DASHBOARD + LOGOUT)                          */}
      {/* ===================================================================== */}
      {activeTab === "mais" && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
              Sessão Administrativa Verificada
            </p>
            <h2 className="text-lg font-black text-slate-900 mt-0.5">{adminName}</h2>
            <p className="text-xs text-slate-500">Usuário: {data.admin.username}</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-100 overflow-hidden">
            {[
              { label: "Loja (Produtos & Lucros)", view: "loja" as AdminSubView, icon: ShoppingBag },
              { label: "API e Integrações (MP, Telegram, Evolution API)", view: "apis" as AdminSubView, icon: Plug },
              { label: "APK Ativo & Adoção PWA", view: "apk" as AdminSubView, icon: Smartphone },
              { label: "Configurações ADM & Novidades", view: "config" as AdminSubView, icon: Settings },
              { label: "Status do IPTV & Servidores", view: "iptv" as AdminSubView, icon: Monitor },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => goAdminSubView(item.view)}
                  className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-slate-50 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-[#FF5500]" />
                    <span className="text-sm font-bold text-slate-800">{item.label}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-400">Abrir</span>
                </button>
              );
            })}
          </div>

          <Link
            to="/dashboard"
            className="flex items-center justify-between bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:bg-slate-50"
          >
            <div className="flex items-center gap-3">
              <ExternalLink className="h-4 w-4 text-slate-700" />
              <span className="text-sm font-bold text-slate-800">Ir para Dashboard Completo (/dashboard)</span>
            </div>
            <span className="text-xs font-bold text-[#FF5500]">Abrir</span>
          </Link>

          <Button
            variant="outline"
            onClick={onLogout}
            className="w-full h-11 rounded-2xl border-rose-200 text-rose-600 hover:bg-rose-50 font-bold"
          >
            <LogOut className="h-4 w-4 mr-2" /> Sair da Área Administrativa
          </Button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAIS: CADASTRAR/EDITAR CLIENTE + RENOVAR CLIENTE                    */}
      {/* ===================================================================== */}
      <CardErrorBoundary fallback={null}>
      <OnlineConnectionsDialog
        open={onlineModalOpen}
        onOpenChange={setOnlineModalOpen}
        query={onlineConnectionsQuery}
      />
      </CardErrorBoundary>

      <ClientFormDialog
        open={clientFormOpen}
        onOpenChange={setClientFormOpen}
        editing={editingClient}
        plans={data.plans}
        servers={data.servers}
        defaultDue={data.today || todayISO()}
        onSaved={invalidateAdmin}
        onCreatedServerAccess={(res) => setCreatedServerAccess(res)}
      />

      <CreatedAccessDialog
        access={createdServerAccess}
        onClose={() => setCreatedServerAccess(null)}
      />

      <RenewClientDialog
        client={renewTarget}
        plans={data.plans}
        onClose={() => setRenewTarget(null)}
        onRenewed={invalidateAdmin}
      />
    </>
  );
}

function QuickActionTile({
  label,
  subLabel,
  badgeClass,
  icon,
  onClick,
}: {
  label: string;
  subLabel?: string;
  badgeClass: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white rounded-2xl py-3 px-1.5 shadow-sm border border-slate-100 flex flex-col items-center justify-start gap-1 text-center hover:border-orange-200 active:scale-95 transition cursor-pointer min-h-[92px]"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${badgeClass}`}>
        {icon}
      </div>
      <div className="flex flex-col items-center">
        <span className="text-[11px] font-bold text-slate-700 leading-tight break-words">{label}</span>
        {subLabel && (
          <span className="text-[9px] font-extrabold text-[#FF5500] leading-none mt-0.5 tracking-wider">{subLabel}</span>
        )}
      </div>
    </button>
  );
}

function SubViewHeader({
  title,
  subtitle,
  onBack,
  rightAction,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  rightAction?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onBack}
          className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 cursor-pointer"
          aria-label="Voltar ao Painel ADM"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h2 className="text-sm font-black text-slate-900 truncate">{title}</h2>
          {subtitle && <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>}
        </div>
      </div>
      {rightAction}
    </div>
  );
}

/* ========================================================================== */
/* MÓDULO: GERENCIAR CLIENTES                                                 */
/* ========================================================================== */
function AdminClientsTab({
  data,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  onNewClient,
  onEditClient,
  onRenewClient,
  onChanged,
}: {
  data: AdminSnapshot;
  filter: ClientFilter;
  onFilterChange: (f: ClientFilter) => void;
  search: string;
  onSearchChange: (v: string) => void;
  onNewClient: () => void;
  onEditClient: (c: AdminClientRow) => void;
  onRenewClient: (c: AdminClientRow) => void;
  onChanged: () => void;
}) {
  const [limit, setLimit] = useState(30);

  const toggleStatus = useMutation({
    mutationFn: ({ c, suspend }: { c: AdminClientRow; suspend: boolean }) =>
      adminPost("toggle_client_status", { id: c.id, due_date: c.due_date, suspend }),
    onSuccess: () => {
      toast.success("Status atualizado");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteClient = useMutation({
    mutationFn: (id: string) => adminPost("delete_client", { id }),
    onSuccess: () => {
      toast.success("Cliente removido");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.clients.filter((c) => {
      if (filter === "ativos" && c.computed_status !== "ativo") return false;
      if (filter === "vencidos" && c.computed_status !== "vencido") return false;
      if (filter === "vencem_hoje" && !c.due_today) return false;
      if (filter === "a_vencer_mes" && !c.due_this_month) return false;
      if (filter === "suspensos" && c.computed_status !== "suspenso" && c.computed_status !== "cancelado")
        return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.iptv_login ?? "").toLowerCase().includes(q) ||
        (c.server_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [data.clients, filter, search]);

  const visible = filtered.slice(0, limit);

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-black text-slate-900">Gerenciar Clientes</h2>
            <p className="text-[11px] text-slate-500">
              {filtered.length} encontrado(s) de {data.kpis.total}
            </p>
          </div>
          <Button
            size="sm"
            onClick={onNewClient}
            className="bg-[#FF5500] hover:bg-[#E04B00] text-white rounded-xl font-bold h-9"
          >
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        </div>

        <div className="relative">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar nome, WhatsApp ou login IPTV..."
            className={`${PORTAL_INPUT_CLASS} pl-9`}
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {[
            { id: "todos" as ClientFilter, label: `Todos (${data.kpis.total})` },
            { id: "ativos" as ClientFilter, label: `Ativos (${data.kpis.ativos})` },
            { id: "vencidos" as ClientFilter, label: `Vencidos (${data.kpis.vencidos})` },
            { id: "vencem_hoje" as ClientFilter, label: `Hoje (${data.kpis.hoje})` },
            { id: "a_vencer_mes" as ClientFilter, label: `Mês (${data.kpis.mes})` },
            { id: "suspensos" as ClientFilter, label: `Bloq. (${data.kpis.suspensos})` },
          ].map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => {
                onFilterChange(chip.id);
                setLimit(30);
              }}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap cursor-pointer transition ${
                filter === chip.id
                  ? "bg-[#FF5500] text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-xs text-slate-400 shadow-sm border border-slate-100">
          Nenhum cliente encontrado para este filtro.
        </div>
      ) : (
        <div className="space-y-2.5">
          {visible.map((c) => {
            const badgeClass =
              c.computed_status === "ativo"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : c.computed_status === "vencido"
                  ? "bg-rose-50 text-rose-700 border-rose-200"
                  : "bg-slate-100 text-slate-600 border-slate-200";
            const statusText =
              c.computed_status === "ativo"
                ? "Ativo"
                : c.computed_status === "vencido"
                  ? "Vencido"
                  : c.computed_status === "suspenso"
                    ? "Bloqueado"
                    : "Cancelado";
            const isBlocked = c.status === "suspenso" || c.status === "cancelado";

            return (
              <div
                key={c.id}
                className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-slate-900 truncate">{c.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {c.phone}
                      {c.iptv_login ? ` · IPTV: ${c.iptv_login}` : ""}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${badgeClass}`}>
                    {statusText}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs bg-slate-50 rounded-xl px-3 py-2">
                  <div>
                    <span className="text-slate-400 text-[10px] block">Valor / Plano</span>
                    <span className="font-extrabold text-slate-800">
                      {brl(c.price_cents)}
                      {c.plan_name ? ` · ${c.plan_name}` : ""}
                      {c.points && c.points > 1 ? ` · ${c.points} telas` : ""}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 text-[10px] block">Vencimento</span>
                    <span className="font-bold text-slate-800">{formatDateBR(c.due_date)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <Button
                    size="sm"
                    onClick={() => onRenewClient(c)}
                    className="h-8 px-2.5 text-[11px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" /> Renovar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onEditClient(c)}
                    className="h-8 px-2.5 text-[11px] rounded-xl border-slate-200 text-slate-700"
                  >
                    <Pencil className="h-3 w-3 mr-1" /> Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={toggleStatus.isPending}
                    onClick={() => toggleStatus.mutate({ c, suspend: !isBlocked })}
                    className="h-8 px-2.5 text-[11px] rounded-xl border-slate-200 text-slate-700"
                  >
                    {isBlocked ? <Unlock className="h-3 w-3 mr-1" /> : <Lock className="h-3 w-3 mr-1" />}
                    {isBlocked ? "Ativar" : "Bloq."}
                  </Button>
                  {(() => {
                    const chargeMsg = buildChargeMessage({
                      identifier: c.name,
                      dueDateISO: c.due_date,
                      login: c.iptv_login,
                      password: c.iptv_password,
                    });
                    const hasPhone = Boolean(normalizeBrPhone(c.phone));
                    return (
                      <a
                        href={buildWhatsAppHref(c.phone, chargeMsg)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => {
                          if (!hasPhone) {
                            e.preventDefault();
                            toast.error("Cliente sem WhatsApp cadastrado.");
                            return;
                          }
                          if (handleAndroidWhatsAppIntent(c.phone, chargeMsg)) {
                            e.preventDefault();
                          }
                        }}
                        className="inline-flex items-center justify-center h-8 px-2.5 text-[11px] font-bold rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      >
                        <MessageCircle className="h-3 w-3 mr-1" /> Zap
                      </a>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Excluir o cliente ${c.name}?`)) {
                        deleteClient.mutate(c.id);
                      }
                    }}
                    className="h-8 px-2.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 flex items-center cursor-pointer ml-auto"
                    aria-label={`Excluir ${c.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          {filtered.length > limit && (
            <Button
              variant="outline"
              onClick={() => setLimit((n) => n + 40)}
              className="w-full h-10 rounded-xl border-slate-200 text-xs font-bold text-slate-700"
            >
              Carregar mais ({filtered.length - limit} restantes)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */
/* MÓDULO: FATURAMENTO                                                        */
/* ========================================================================== */
function AdminFinanceTab({ data }: { data: AdminSnapshot }) {
  const f = data.finance;
  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Visão Financeira
        </p>
        <h2 className="text-lg font-black text-slate-900">Faturamento & Lucro</h2>
      </div>

      {f.catalogBlocked && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-xs text-amber-900 space-y-1">
          <p className="font-extrabold flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            Servidores e Loja bloqueados pelo RLS no Supabase
          </p>
          <p className="text-[11px] leading-snug text-amber-800">
            Execute a migration <code className="font-mono font-bold">20261111_portal_admin.sql</code> no SQL
            Editor do Supabase para liberar o custo por servidor/acesso (ex.: R$ 7,00 × telas) e as
            vendas da loja.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100">
          <p className="text-[11px] text-slate-500 font-medium">Receita prevista / mês</p>
          <p className="text-lg font-black text-slate-900 mt-0.5">{brl(f.receitaMes)}</p>
        </div>
        <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100">
          <p className="text-[11px] text-slate-500 font-medium">Despesa servidores / mês</p>
          <p className="text-lg font-black text-rose-600 mt-0.5">{brl(f.despesaMes)}</p>
          {typeof f.activeAccesses === "number" && (
            <p className="text-[10px] text-slate-400 mt-0.5">{f.activeAccesses} acesso(s) ativo(s)</p>
          )}
        </div>
        <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100">
          <p className="text-[11px] text-slate-500 font-medium">Lucro líquido no mês</p>
          <p className="text-lg font-black text-emerald-600 mt-0.5">{brl(f.lucroMes)}</p>
        </div>
        <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100">
          <p className="text-[11px] text-slate-500 font-medium">Lucro estimado do mês</p>
          <p className="text-lg font-black text-sky-600 mt-0.5">
            {brl((f.receitaMes ?? 0) - (f.despesaMes ?? 0))}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] text-slate-500">Lucro acumulado total</p>
          <p className="text-base font-black text-slate-900">{brl(f.lucroTotal)}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-slate-500">Vendas da Loja ({f.storeStats.count})</p>
          <p className="text-base font-black text-violet-600">{brl(f.storeStats.sales)}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
            Últimos Recebimentos ({f.paymentsCount})
          </h3>
          <Wallet className="h-4 w-4 text-[#FF5500]" />
        </div>
        {f.recentEntries.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">Nenhum pagamento registrado.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {f.recentEntries.slice(0, 25).map((e) => (
              <div key={e.id} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{e.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">
                    {formatDateTimeBR(e.date)} · {e.kind} ({e.method})
                  </p>
                </div>
                <span className="text-xs font-black text-emerald-700 shrink-0">
                  {brl(e.amount_cents)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ========================================================================== */
/* SUBMÓDULO: LOJA                                                            */
/* ========================================================================== */
function AdminLojaSubView({
  data,
  onBack,
  onChanged,
}: {
  data: AdminSnapshot;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    id: "",
    key: "",
    label: "",
    sale: "",
    cost: "0,00",
    duration_days: "30",
    emoji: "🛒",
    active: true,
    image_url: "",
  });

  const saveProduct = useMutation({
    mutationFn: () =>
      adminPost("upsert_product", {
        id: form.id || undefined,
        key: form.key,
        label: form.label,
        sale_cents: parseBrlToCents(form.sale),
        cost_cents: parseBrlToCents(form.cost),
        duration_days: Number(form.duration_days) || 30,
        emoji: form.emoji || "🛒",
        active: form.active,
        image_url: form.image_url || null,
      }),
    onSuccess: () => {
      toast.success("Produto salvo!");
      setModalOpen(false);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteProduct = useMutation({
    mutationFn: (id: string) => adminPost("delete_product", { id }),
    onSuccess: () => {
      toast.success("Produto removido");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (p: AdminStoreProduct) => {
    setForm({
      id: p.id,
      key: p.key,
      label: p.label,
      sale: (p.sale_cents / 100).toFixed(2).replace(".", ","),
      cost: (p.cost_cents / 100).toFixed(2).replace(".", ","),
      duration_days: String(p.duration_days),
      emoji: p.emoji || "🛒",
      active: p.active,
      image_url: p.image_url || "",
    });
    setModalOpen(true);
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      <SubViewHeader
        title="Loja Virtual AJP"
        subtitle={`${data.store_products.length} produtos · ${data.finance.storeStats.count} vendas`}
        onBack={onBack}
        rightAction={
          <Button
            size="sm"
            onClick={() => {
              setForm({
                id: "",
                key: "",
                label: "",
                sale: "",
                cost: "0,00",
                duration_days: "30",
                emoji: "🛒",
                active: true,
                image_url: "",
              });
              setModalOpen(true);
            }}
            className="h-8 bg-[#FF5500] hover:bg-[#E04B00] text-white rounded-xl text-xs font-bold"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Produto
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
          <p className="text-[10px] text-slate-500">Vendas Loja</p>
          <p className="text-sm font-black text-slate-900">{brl(data.finance.storeStats.sales)}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
          <p className="text-[10px] text-slate-500">Custo</p>
          <p className="text-sm font-black text-rose-600">{brl(data.finance.storeStats.cost)}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
          <p className="text-[10px] text-slate-500">Lucro Loja</p>
          <p className="text-sm font-black text-emerald-600">{brl(data.finance.storeStats.profit)}</p>
        </div>
      </div>

      <div className="space-y-2">
        {data.store_products.map((p) => (
          <div
            key={p.id}
            className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {p.image_url ? (
                <img src={p.image_url} alt={p.label} className="w-10 h-10 rounded-xl object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-lg">
                  {p.emoji}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-slate-900 truncate">{p.label}</p>
                <p className="text-[11px] text-slate-500">
                  Venda {brl(p.sale_cents)} · Custo {brl(p.cost_cents)} ·{" "}
                  <span className={p.active ? "text-emerald-600 font-bold" : "text-slate-400"}>
                    {p.active ? "Ativo" : "Oculto"}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => openEdit(p)}
                className="p-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                aria-label="Editar produto"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Remover "${p.label}"?`)) deleteProduct.mutate(p.id);
                }}
                className="p-2 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 cursor-pointer"
                aria-label="Remover produto"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className={PORTAL_MODAL_CLASS}>
          <DialogHeader className="sr-only">
            <DialogTitle>{form.id ? "Editar Produto" : "Novo Produto"}</DialogTitle>
          </DialogHeader>
          <PortalModalHeader
            title={form.id ? "Editar Produto" : "Novo Produto"}
            subtitle="Configure o item exibido na loja do portal"
            onClose={() => setModalOpen(false)}
          />
          <div className="p-4 space-y-3 overflow-y-auto max-h-[calc(90dvh-136px)]">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
              <div className="grid grid-cols-[76px_1fr] gap-2.5">
                <div>
                  <Label className={PORTAL_LABEL_CLASS}>Emoji</Label>
                  <Input
                    value={form.emoji}
                    onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                    className={`${PORTAL_INPUT_CLASS} text-center text-base`}
                  />
                </div>
                <div>
                  <Label className={PORTAL_LABEL_CLASS}>Nome do produto *</Label>
                  <Input
                    value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                    placeholder="ChatGPT Plus - 30 dias"
                    className={PORTAL_INPUT_CLASS}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className={PORTAL_LABEL_CLASS}>Venda (R$)</Label>
                  <Input
                    value={form.sale}
                    onChange={(e) => setForm({ ...form, sale: e.target.value })}
                    placeholder="30,00"
                    inputMode="decimal"
                    className={PORTAL_INPUT_CLASS}
                  />
                </div>
                <div>
                  <Label className={PORTAL_LABEL_CLASS}>Custo (R$)</Label>
                  <Input
                    value={form.cost}
                    onChange={(e) => setForm({ ...form, cost: e.target.value })}
                    placeholder="0,00"
                    inputMode="decimal"
                    className={PORTAL_INPUT_CLASS}
                  />
                </div>
                <div>
                  <Label className={PORTAL_LABEL_CLASS}>Validade (d)</Label>
                  <Input
                    value={form.duration_days}
                    onChange={(e) => setForm({ ...form, duration_days: e.target.value })}
                    inputMode="numeric"
                    className={PORTAL_INPUT_CLASS}
                  />
                </div>
              </div>
              <div>
                <Label className={PORTAL_LABEL_CLASS}>URL da Foto (opcional)</Label>
                <Input
                  value={form.image_url}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                  placeholder="https://..."
                  className={PORTAL_INPUT_CLASS}
                />
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-slate-800">Ativo no Portal do Cliente</p>
                  <p className="text-[11px] text-slate-500">Exibe o produto para compra na vitrine</p>
                </div>
                <Switch
                  checked={form.active}
                  onCheckedChange={(v) => setForm({ ...form, active: v })}
                  className={PORTAL_SWITCH_CLASS}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="bg-white border-t border-slate-200/80 px-4 py-3 flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
              className="rounded-xl border-slate-200 text-slate-600 hover:bg-slate-100 h-10"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => saveProduct.mutate()}
              disabled={saveProduct.isPending}
              className="flex-1 bg-[#FF5500] hover:bg-[#E04B00] text-white rounded-xl font-bold h-10 shadow-sm"
            >
              {saveProduct.isPending ? "Salvando..." : "Salvar Produto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ========================================================================== */
/* SUBMÓDULO: API E INTEGRAÇÕES                                                */
/* ========================================================================== */
function AdminApisSubView({
  data,
  onBack,
  onChanged,
}: {
  data: AdminSnapshot;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [mp, setMp] = useState(data.settings.mp_access_token);
  const [tgToken, setTgToken] = useState(data.settings.telegram_bot_token);
  const [tgChat, setTgChat] = useState(data.settings.telegram_chat_id);
  const [zInst, setZInst] = useState(data.settings.evolution_instance_name ?? "");
  const [zTok, setZTok] = useState("");
  const [zCli, setZCli] = useState(data.settings.evolution_base_url ?? "");
  const [showSecrets, setShowSecrets] = useState(false);

  const [serverName, setServerName] = useState(data.settings.iptv_server_name || "RBOYS");
  const [serverUrl, setServerUrl] = useState(data.settings.iptv_base_url || "https://cms.rboys02.click/api");
  const [serverApiKey, setServerApiKey] = useState("");
  const isServerConfigured = Boolean(data.settings.iptv_api_configured);
  const [serverTestResult, setServerTestResult] = useState<ServerTestResult | null>(null);

  const savePatch = useMutation({
    mutationFn: (patch: Record<string, any>) => adminPost("save_settings", { patch }),
    onSuccess: () => {
      toast.success("Integração salva!");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testTg = useMutation({
    mutationFn: () => adminPost("test_telegram"),
    onSuccess: () => toast.success("Mensagem de teste enviada ao Telegram!"),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveServer = useMutation({
    mutationFn: () =>
      adminPost("save_iptv_server", {
        server_name: serverName,
        base_url: serverUrl,
        api_key: serverApiKey,
      }),
    onSuccess: () => {
      toast.success("Servidor IPTV salvo com sucesso!");
      setServerApiKey("");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testServer = useMutation({
    mutationFn: () =>
      adminPost<ServerTestResult>("test_iptv_server", {
        server_name: serverName,
        base_url: serverUrl,
        api_key: serverApiKey,
      }),
    onSuccess: (res) => {
      setServerTestResult(res);
      toast.success(res?.message || "Conexão com servidor IPTV bem-sucedida!");
    },
    onError: (e: Error) => {
      setServerTestResult(null);
      toast.error(e.message);
    },
  });

  const zapiStatus = useQuery({
    queryKey: ["portal", "admin", "evolution-status"],
    queryFn: () => adminPost<{ configured: boolean; connected: boolean }>("evolution_status"),
    refetchInterval: 8000,
    retry: false,
  });

  const zapiQr = useQuery({
    queryKey: ["portal", "admin", "evolution-qr"],
    queryFn: () => adminPost<{ configured: boolean; connected: boolean; image: string | null }>("evolution_qr"),
    enabled: zapiStatus.data?.configured === true && zapiStatus.data?.connected === false,
    refetchInterval: 20000,
    retry: false,
  });

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      <SubViewHeader
        title="API e Integrações"
        subtitle="Mercado Pago, Telegram, Evolution API e Servidor IPTV"
        onBack={onBack}
        rightAction={
          <button
            type="button"
            onClick={() => setShowSecrets((v) => !v)}
            className="text-xs font-bold text-[#FF5500] flex items-center gap-1 cursor-pointer"
          >
            {showSecrets ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showSecrets ? "Ocultar" : "Mostrar"}
          </button>
        }
      />

      {/* Mercado Pago */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-extrabold text-slate-900">Mercado Pago (Produção)</p>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              mp ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {mp ? "Configurado" : "Não configurado"}
          </span>
        </div>
        <div>
          <Label className={PORTAL_LABEL_CLASS}>Access Token de Produção</Label>
          <Input
            type={showSecrets ? "text" : "password"}
            value={mp}
            onChange={(e) => setMp(e.target.value)}
            placeholder="APP_USR-..."
            className={PORTAL_INPUT_CLASS}
          />
        </div>
        <Button
          size="sm"
          disabled={savePatch.isPending}
          onClick={() => savePatch.mutate({ mp_access_token: mp })}
          className="h-9 bg-[#FF5500] hover:bg-[#E04B00] text-white rounded-xl text-xs font-bold shadow-sm shadow-[#FF5500]/20 cursor-pointer"
        >
          <Save className="h-3.5 w-3.5 mr-1" /> Salvar Mercado Pago
        </Button>
      </div>

      {/* Telegram */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
        <p className="text-xs font-extrabold text-slate-900">Telegram Bot</p>
        <div className="space-y-2.5">
          <div>
            <Label className={PORTAL_LABEL_CLASS}>Bot Token</Label>
            <Input
              type={showSecrets ? "text" : "password"}
              value={tgToken}
              onChange={(e) => setTgToken(e.target.value)}
              placeholder="Bot Token (BotFather)"
              className={PORTAL_INPUT_CLASS}
            />
          </div>
          <div>
            <Label className={PORTAL_LABEL_CLASS}>Chat ID</Label>
            <Input
              value={tgChat}
              onChange={(e) => setTgChat(e.target.value)}
              placeholder="Chat ID (Ex: 8010768365)"
              className={PORTAL_INPUT_CLASS}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={savePatch.isPending}
            onClick={() => savePatch.mutate({ telegram_bot_token: tgToken, telegram_chat_id: tgChat })}
            className="h-9 bg-[#FF5500] hover:bg-[#E04B00] text-white rounded-xl text-xs font-bold shadow-sm shadow-[#FF5500]/20 cursor-pointer"
          >
            Salvar
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={testTg.isPending}
            onClick={() => testTg.mutate()}
            className="h-9 rounded-xl text-xs font-bold bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Send className="h-3.5 w-3.5 mr-1" /> Testar Telegram
          </Button>
        </div>
      </div>

      {/* Evolution API WhatsApp */}
      <EvolutionPortalCard
        baseUrl={zCli} instance={zInst} apiKey={zTok}
        setBaseUrl={setZCli} setInstance={setZInst} setApiKey={setZTok}
        configured={data.settings.evolution_configured}
        showSecrets={showSecrets} status={zapiStatus} qr={zapiQr}
        onChanged={onChanged}
      />

      {/* Servidor IPTV / P2P (API) */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ServerIcon className="h-4 w-4 text-[#FF5500]" />
            <p className="text-xs font-extrabold text-slate-900">Servidor IPTV / P2P (API)</p>
          </div>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              isServerConfigured ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {isServerConfigured ? "Configurado" : "Não configurado"}
          </span>
        </div>
        <div className="space-y-2.5">
          <div>
            <Label className={PORTAL_LABEL_CLASS}>Nome do Servidor</Label>
            <Input
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="Ex: RBOYS"
              className={PORTAL_INPUT_CLASS}
            />
          </div>
          <div>
            <Label className={PORTAL_LABEL_CLASS}>URL Base da API</Label>
            <Input
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://cms.rboys02.click/api"
              className={PORTAL_INPUT_CLASS}
            />
          </div>
          <div>
            <Label className={PORTAL_LABEL_CLASS}>Chave API (X-API-Key)</Label>
            <Input
              type={showSecrets ? "text" : "password"}
              value={serverApiKey}
              onChange={(e) => setServerApiKey(e.target.value)}
              placeholder={isServerConfigured ? "•••••••••••••••• (Preenchida — digite para alterar)" : "Cole a sua X-API-Key aqui"}
              className={PORTAL_INPUT_CLASS}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            disabled={saveServer.isPending}
            onClick={() => saveServer.mutate()}
            className="h-9 bg-[#FF5500] hover:bg-[#E04B00] text-white rounded-xl text-xs font-bold shadow-sm shadow-[#FF5500]/20 cursor-pointer"
          >
            {saveServer.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1" />
            )}
            Salvar Servidor
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={testServer.isPending}
            onClick={() => testServer.mutate()}
            className="h-9 rounded-xl text-xs font-bold bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            {testServer.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Plug className="h-3.5 w-3.5 mr-1" />
            )}
            Testar Conexão
          </Button>
        </div>

        {/* Exibição dos dados da conta e saldo do teste de conexão */}
        {serverTestResult && (
          <div className="mt-3 p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/70 text-slate-900 space-y-2.5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Conexão Ativa (HTTP {serverTestResult.status} • {serverTestResult.latencyMs}ms)</span>
              </div>
              <span className="text-[10px] text-emerald-700 font-mono bg-emerald-100/80 px-2 py-0.5 rounded">
                GET {serverTestResult.url?.split("/").slice(-2).join("/") || "v1/me"}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-0.5">
              <div className="bg-white border border-emerald-100 rounded-lg p-2.5 shadow-xs">
                <p className="text-[10px] uppercase font-bold text-slate-500">Saldo / Créditos</p>
                <p className="text-base font-extrabold text-emerald-700">
                  {serverTestResult.account?.credits !== null && serverTestResult.account?.credits !== undefined
                    ? `${serverTestResult.account.credits} créditos`
                    : serverTestResult.account?.balance !== null && serverTestResult.account?.balance !== undefined
                    ? `R$ ${serverTestResult.account.balance}`
                    : "Ativo"}
                </p>
              </div>

              <div className="bg-white border border-emerald-100 rounded-lg p-2.5 shadow-xs">
                <p className="text-[10px] uppercase font-bold text-slate-500">Conta / Usuário</p>
                <p
                  className="text-xs font-bold text-slate-800 truncate"
                  title={serverTestResult.account?.name || serverTestResult.account?.username || "Autenticado"}
                >
                  {serverTestResult.account?.name || serverTestResult.account?.username || "Autenticado"}
                </p>
                {serverTestResult.account?.username && serverTestResult.account?.name && (
                  <p className="text-[10px] text-slate-500 truncate">@{serverTestResult.account.username}</p>
                )}
              </div>

              {serverTestResult.account?.active_clients !== null && serverTestResult.account?.active_clients !== undefined && (
                <div className="bg-white border border-emerald-100 rounded-lg p-2.5 shadow-xs col-span-2 sm:col-span-1">
                  <p className="text-[10px] uppercase font-bold text-slate-500">Clientes Ativos</p>
                  <p className="text-sm font-extrabold text-slate-800">
                    {serverTestResult.account.active_clients}
                  </p>
                </div>
              )}
            </div>

            {serverTestResult.account?.email && (
              <p className="text-[11px] text-slate-600">
                <span className="font-semibold text-slate-700">E-mail:</span> {serverTestResult.account.email}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ========================================================================== */
/* SUBMÓDULO: APK ATIVO & PWA                                                 */
/* ========================================================================== */
function AdminApkSubView({
  data,
  onBack,
  onChanged,
}: {
  data: AdminSnapshot;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [androidUrl, setAndroidUrl] = useState(data.settings.app_android_url);
  const [iosUrl, setIosUrl] = useState(data.settings.app_ios_url);

  const saveApk = useMutation({
    mutationFn: () =>
      adminPost("save_settings", {
        patch: { app_android_url: androidUrl, app_ios_url: iosUrl },
      }),
    onSuccess: () => {
      toast.success("Links de APK / App salvos!");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const installedClients = useMemo(
    () =>
      data.clients
        .filter((c) => Boolean(c.pwa_installed_at))
        .sort((a, b) => ((a.pwa_installed_at || "") < (b.pwa_installed_at || "") ? 1 : -1))
        .slice(0, 15),
    [data.clients],
  );

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      <SubViewHeader
        title="APK Ativo & App PWA"
        subtitle={`Adoção: ${data.kpis.pwa_installed} de ${data.kpis.total} clientes (${data.kpis.pwa_pct}%)`}
        onBack={onBack}
      />

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
          <p className="text-[10px] text-slate-500">Instalado</p>
          <p className="text-lg font-black text-emerald-600">{data.kpis.pwa_installed}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
          <p className="text-[10px] text-slate-500">Não inst.</p>
          <p className="text-lg font-black text-rose-600">{data.kpis.pwa_not_installed}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
          <p className="text-[10px] text-slate-500">Adoção</p>
          <p className="text-lg font-black text-sky-600">{data.kpis.pwa_pct}%</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
        <div>
          <Label className={PORTAL_LABEL_CLASS}>Link APK Android (exibido no Portal)</Label>
          <div className="flex gap-1.5">
            <Input
              value={androidUrl}
              onChange={(e) => setAndroidUrl(e.target.value)}
              placeholder="https://..."
              className={PORTAL_INPUT_CLASS}
            />
            {androidUrl && (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(androidUrl);
                  toast.success("Link Android copiado!");
                }}
                className="px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer shrink-0"
                aria-label="Copiar link Android"
              >
                <Copy className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div>
          <Label className={PORTAL_LABEL_CLASS}>Link App iOS / Web Clip</Label>
          <Input
            value={iosUrl}
            onChange={(e) => setIosUrl(e.target.value)}
            placeholder="https://..."
            className={PORTAL_INPUT_CLASS}
          />
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={saveApk.isPending}
            onClick={() => saveApk.mutate()}
            className="flex-1 bg-[#FF5500] hover:bg-[#E04B00] text-white rounded-xl text-xs font-bold"
          >
            <Save className="h-3.5 w-3.5 mr-1" /> Salvar Links APK
          </Button>
          {androidUrl && (
            <a
              href={androidUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-3 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold"
            >
              <Download className="h-3.5 w-3.5" /> Testar
            </a>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
          Últimas Instalações PWA ({installedClients.length})
        </h3>
        {installedClients.length === 0 ? (
          <p className="text-xs text-slate-400">Nenhuma instalação registrada ainda.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {installedClients.map((c) => (
              <div key={c.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 truncate">{c.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{c.last_device || "Dispositivo PWA"}</p>
                </div>
                <span className="text-[10px] font-bold text-emerald-700 shrink-0">
                  {c.pwa_installed_at ? formatDateTimeBR(c.pwa_installed_at) : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ========================================================================== */
/* SUBMÓDULO: CONFIGURAÇÕES ADM                                                */
/* ========================================================================== */
function AdminConfigSubView({
  data,
  onBack,
  onChanged,
}: {
  data: AdminSnapshot;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [whatsapp, setWhatsapp] = useState(data.settings.whatsapp_instance);
  const [supportMsg, setSupportMsg] = useState(data.settings.support_message);
  const [storeSlug, setStoreSlug] = useState(data.settings.store_slug);
  const [storeTitle, setStoreTitle] = useState(data.settings.store_title);
  const [moviesText, setMoviesText] = useState(data.settings.updates_movies_text);
  const [seriesText, setSeriesText] = useState(data.settings.updates_series_text);
  const [gamesText, setGamesText] = useState(data.settings.updates_games_text);
  const [referralEnabled, setReferralEnabled] = useState(data.settings.referral_enabled);

  const saveCfg = useMutation({
    mutationFn: () =>
      adminPost("save_settings", {
        patch: {
          whatsapp_instance: whatsapp,
          support_message: supportMsg,
          store_slug: storeSlug,
          store_title: storeTitle,
          updates_movies_text: moviesText,
          updates_series_text: seriesText,
          updates_games_text: gamesText,
          referral_enabled: referralEnabled,
        },
      }),
    onSuccess: () => {
      toast.success("Configurações atualizadas!");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      <SubViewHeader
        title="Configurações ADM"
        subtitle="Atendimento, Novidades e Loja Pública"
        onBack={onBack}
      />

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3 text-xs">
        <div>
          <Label className={PORTAL_LABEL_CLASS}>WhatsApp de Atendimento</Label>
          <Input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="5511999999999"
            className={PORTAL_INPUT_CLASS}
          />
        </div>
        <div>
          <Label className={PORTAL_LABEL_CLASS}>Mensagem Padrão de Cobrança / Suporte</Label>
          <Textarea
            value={supportMsg}
            onChange={(e) => setSupportMsg(e.target.value)}
            rows={2}
            className={PORTAL_TEXTAREA_CLASS}
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <Label className={PORTAL_LABEL_CLASS}>Slug Loja (/loja/...)</Label>
            <Input
              value={storeSlug}
              onChange={(e) => setStoreSlug(e.target.value)}
              className={PORTAL_INPUT_CLASS}
            />
          </div>
          <div>
            <Label className={PORTAL_LABEL_CLASS}>Título da Loja</Label>
            <Input
              value={storeTitle}
              onChange={(e) => setStoreTitle(e.target.value)}
              className={PORTAL_INPUT_CLASS}
            />
          </div>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <Label className="text-xs font-bold text-slate-800 cursor-pointer">
            Programa Indique e Ganhe Ativo
          </Label>
          <Switch
            checked={referralEnabled}
            onCheckedChange={setReferralEnabled}
            className={PORTAL_SWITCH_CLASS}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3 text-xs">
        <p className="font-extrabold text-slate-900">Novidades exibidas no Portal</p>
        <div>
          <Label className={PORTAL_LABEL_CLASS}>Filmes Adicionados</Label>
          <Textarea
            value={moviesText}
            onChange={(e) => setMoviesText(e.target.value)}
            rows={3}
            className={`${PORTAL_TEXTAREA_CLASS} font-mono text-[11px]`}
          />
        </div>
        <div>
          <Label className={PORTAL_LABEL_CLASS}>Séries Adicionadas</Label>
          <Textarea
            value={seriesText}
            onChange={(e) => setSeriesText(e.target.value)}
            rows={3}
            className={`${PORTAL_TEXTAREA_CLASS} font-mono text-[11px]`}
          />
        </div>
        <div>
          <Label className={PORTAL_LABEL_CLASS}>Jogos do Dia</Label>
          <Textarea
            value={gamesText}
            onChange={(e) => setGamesText(e.target.value)}
            rows={3}
            className={`${PORTAL_TEXTAREA_CLASS} font-mono text-[11px]`}
          />
        </div>
      </div>

      <Button
        disabled={saveCfg.isPending}
        onClick={() => saveCfg.mutate()}
        className="w-full h-11 bg-[#FF5500] hover:bg-[#E04B00] text-white rounded-2xl font-bold"
      >
        <Save className="h-4 w-4 mr-1.5" />
        {saveCfg.isPending ? "Salvando..." : "Salvar Todas as Configurações"}
      </Button>
    </div>
  );
}

/* ========================================================================== */
/* SUBMÓDULO: STATUS DO IPTV & SERVIDORES                                     */
/* ========================================================================== */
function AdminIptvSubView({
  data,
  onBack,
  onChanged,
}: {
  data: AdminSnapshot;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [srvName, setSrvName] = useState("");
  const [srvCost, setSrvCost] = useState("0,00");
  const [query, setQuery] = useState("");

  const addServer = useMutation({
    mutationFn: () =>
      adminPost("upsert_server", {
        name: srvName,
        credit_cost_cents: parseBrlToCents(srvCost),
      }),
    onSuccess: () => {
      toast.success("Servidor salvo!");
      setSrvName("");
      setSrvCost("0,00");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteServer = useMutation({
    mutationFn: (id: string) => adminPost("delete_server", { id }),
    onSuccess: () => {
      toast.success("Servidor removido");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const iptvClients = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.clients
      .filter((c) => c.iptv_login || c.iptv_password || c.server_id)
      .filter((c) => {
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          (c.iptv_login ?? "").toLowerCase().includes(q) ||
          (c.server_name ?? "").toLowerCase().includes(q)
        );
      })
      .slice(0, 30);
  }, [data.clients, query]);

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      <SubViewHeader
        title="Status do IPTV & Servidores"
        subtitle={`${data.kpis.iptv_configured} logins · ${data.servers.length} servidores`}
        onBack={onBack}
      />

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
          <p className="text-[10px] text-slate-500">Logins IPTV</p>
          <p className="text-lg font-black text-slate-900">{data.kpis.iptv_configured}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
          <p className="text-[10px] text-slate-500">Ativos</p>
          <p className="text-lg font-black text-emerald-600">{data.kpis.ativos}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
          <p className="text-[10px] text-slate-500">Bloq / Venc</p>
          <p className="text-lg font-black text-rose-600">
            {data.kpis.vencidos + data.kpis.suspensos}
          </p>
        </div>
      </div>

      {/* Servidores */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
          Servidores Cadastrados
        </h3>

        {data.servers.length === 0 ? (
          <p className="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
            {data.finance.catalogBlocked
              ? "Servidores bloqueados pelo RLS no Supabase. Execute a migration 20261111_portal_admin.sql no SQL Editor para exibir e somar o custo por acesso."
              : "Nenhum servidor cadastrado ainda."}
          </p>
        ) : (
          <div className="space-y-2">
            {data.servers.map((s) => (
              <div
                key={s.id}
                className="rounded-xl bg-slate-50 p-3 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <ServerIcon className="h-4 w-4 text-sky-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-slate-900 truncate">{s.name}</p>
                    <p className="text-[10px] text-slate-500">
                      Custo/crédito: {brl(s.credit_cost_cents)} · {s.active_count} cliente(s) ·{" "}
                      {s.active_accesses ?? s.active_count} acesso(s) · Est.{" "}
                      {brl(s.monthly_cost_cents)}/mês
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Remover servidor "${s.name}"?`)) deleteServer.mutate(s.id);
                  }}
                  className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 cursor-pointer"
                  aria-label="Excluir servidor"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="pt-2 border-t border-slate-100 grid grid-cols-[1fr_95px_auto] gap-2 items-center">
          <Input
            value={srvName}
            onChange={(e) => setSrvName(e.target.value)}
            placeholder="Novo servidor..."
            className={`${PORTAL_INPUT_CLASS} h-9`}
          />
          <Input
            value={srvCost}
            onChange={(e) => setSrvCost(e.target.value)}
            placeholder="Custo R$"
            className={`${PORTAL_INPUT_CLASS} h-9`}
          />
          <Button
            size="sm"
            disabled={!srvName.trim() || addServer.isPending}
            onClick={() => addServer.mutate()}
            className="h-9 bg-[#FF5500] hover:bg-[#E04B00] text-white rounded-xl font-bold"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Credenciais IPTV */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
            Acessos IPTV Recentes
          </h3>
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cliente, login ou servidor..."
          className={`${PORTAL_INPUT_CLASS} h-9`}
        />
        <div className="divide-y divide-slate-100">
          {iptvClients.map((c) => (
            <div key={c.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <p className="font-bold text-slate-900 truncate">
                  {c.name}
                  {c.points && c.points > 1 ? (
                    <span className="ml-1.5 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">
                      {c.points} telas
                    </span>
                  ) : null}
                </p>
                <p className="text-[11px] font-mono text-slate-600 truncate">
                  {c.iptv_login || "—"} / {c.iptv_password || "—"}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    c.computed_status === "ativo"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-rose-50 text-rose-700"
                  }`}
                >
                  {c.computed_status === "ativo" ? "Online" : "Vencido"}
                </span>
                {c.server_name && <p className="text-[10px] text-slate-400 mt-0.5">{c.server_name}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* SUBMÓDULO: CLIENTES DO SERVIDOR (RBOYS)                                    */
/* ========================================================================== */
function AdminServerClientsSubView({
  data,
  initialFilter,
  onBack,
  onChanged,
}: {
  data: AdminSnapshot;
  initialFilter: ServerClientStatusFilter;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ServerClientStatusFilter>(initialFilter);
  const [typeFilter, setTypeFilter] = useState<"todos" | "iptv" | "p2p">("todos");
  const [showSecrets, setShowSecrets] = useState(false);
  const [pendingClientId, setPendingClientId] = useState<string | null>(null);

  // Mapa local para identificar quem já está cadastrado no AJPVIP (por iptv_login)
  const localMap = useMemo(() => {
    const map = new Map<string, AdminClientRow>();
    for (const c of data.clients) {
      if (c.iptv_login) {
        map.set(c.iptv_login.trim().toLowerCase(), c);
      }
    }
    return map;
  }, [data.clients]);

  const serverQuery = useQuery(serverClientsQueryOptions);

  // Mutação para importar ou atualizar vínculo mantendo data exata do servidor
  const importClient = useMutation({
    mutationFn: (client: NormalizedServerClient) => {
      setPendingClientId(String(client.id));
      return adminPost("import_server_client", { client });
    },
    onSuccess: (_, client) => {
      setPendingClientId(null);
      toast.success(`Cliente ${client.username} sincronizado com sucesso no AJPVIP!`);
      onChanged();
      void serverQuery.refetch();
    },
    onError: (err: Error) => {
      setPendingClientId(null);
      toast.error(err.message || "Falha ao vincular cliente");
    },
  });

  const allClients = serverQuery.data?.clients ?? [];
  const kpis = serverQuery.data?.kpis ?? {
    total: allClients.length,
    ativos: allClients.filter(
      (c) =>
        (!c.is_expired && c.due_date_str !== null && !c.is_due_today) ||
        c.status === "ativo" ||
        c.status === "active"
    ).length,
    vencidos: allClients.filter(
      (c) => c.is_expired || c.status === "vencido" || c.status === "expired"
    ).length,
    vencem_hoje: allClients.filter(
      (c) => c.is_due_today || c.status === "vencem_hoje"
    ).length,
  };

  // Filtragem
  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allClients.filter((client) => {
      if (typeFilter !== "todos") {
        const clientType = String(client.type || "").toLowerCase();
        if (clientType !== typeFilter) {
          return false;
        }
      }
      if (statusFilter !== "todos") {
        if (statusFilter === "a_vencer_mes" && !dueThisMonth(client, data.today || todayISO())) return false;
        if (statusFilter === "ativos") {
          const isAtivo =
            (!client.is_expired &&
              client.due_date_str !== null &&
              !client.is_due_today) ||
            client.status === "ativo" ||
            client.status === "active";
          if (!isAtivo) return false;
        } else if (statusFilter === "vencem_hoje") {
          const isHoje = client.is_due_today || client.status === "vencem_hoje";
          if (!isHoje) return false;
        } else if (statusFilter === "vencidos") {
          const isVencido =
            client.is_expired ||
            client.status === "vencido" ||
            client.status === "expired";
          if (!isVencido) return false;
        }
      }
      if (term) {
        const matchesUser = client.username.toLowerCase().includes(term);
        const matchesName = client.name?.toLowerCase().includes(term);
        const matchesNotes = client.notes?.toLowerCase().includes(term);
        if (!matchesUser && !matchesName && !matchesNotes) {
          return false;
        }
      }
      return true;
    });
  }, [allClients, search, statusFilter, typeFilter]);

  return (
    <div className="space-y-4">
      <SubViewHeader
        title="Clientes do Servidor"
        subtitle={`Sincronização em tempo real — ${serverQuery.data?.server_name || "RBOYS"}`}
        onBack={onBack}
        rightAction={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowSecrets(!showSecrets)}
              className="h-8 px-2.5 rounded-xl text-xs font-semibold border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              {showSecrets ? <EyeOff className="h-3.5 w-3.5 mr-1 text-slate-500" /> : <Eye className="h-3.5 w-3.5 mr-1 text-slate-500" />}
              {showSecrets ? "Ocultar Senhas" : "Ver Senhas"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={serverQuery.isFetching}
              onClick={() => void serverQuery.refetch()}
              className="h-8 px-2.5 rounded-xl text-xs font-semibold border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${serverQuery.isFetching ? "animate-spin text-[#FF5500]" : "text-slate-500"}`} />
              Atualizar
            </Button>
          </div>
        }
      />

      {/* KPIs Cards Resumidos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm">
          <p className="text-[11px] font-bold text-slate-500">Total no Servidor</p>
          <p className="text-xl font-extrabold text-slate-900 mt-0.5">{kpis.total}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 border border-emerald-100 shadow-sm bg-gradient-to-br from-white to-emerald-50/30">
          <p className="text-[11px] font-bold text-emerald-700">Ativos</p>
          <p className="text-xl font-extrabold text-emerald-600 mt-0.5">{kpis.ativos}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 border border-amber-100 shadow-sm bg-gradient-to-br from-white to-amber-50/30">
          <p className="text-[11px] font-bold text-amber-700">Vencendo Hoje</p>
          <p className="text-xl font-extrabold text-amber-600 mt-0.5">{kpis.vencem_hoje}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 border border-rose-100 shadow-sm bg-gradient-to-br from-white to-rose-50/30">
          <p className="text-[11px] font-bold text-rose-700">Vencidos</p>
          <p className="text-xl font-extrabold text-rose-600 mt-0.5">{kpis.vencidos}</p>
        </div>
      </div>

      {/* Barra de Busca e Filtros */}
      <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por login, nome ou observação..."
            className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#FF5500] focus:bg-white transition"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Filtro Status */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            {statusFilter === "a_vencer_mes" && (
              <span className="text-xs text-invoice-muted">A vencer no mês</span>
            )}
            <button
              type="button"
              onClick={() => setStatusFilter("todos")}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                statusFilter === "todos" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Todos ({allClients.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("ativos")}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                statusFilter === "ativos" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              Ativos ({kpis.ativos})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("vencem_hoje")}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                statusFilter === "vencem_hoje" ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-700 hover:bg-amber-100"
              }`}
            >
              Hoje ({kpis.vencem_hoje})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("vencidos")}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                statusFilter === "vencidos" ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-700 hover:bg-rose-100"
              }`}
            >
              Vencidos ({kpis.vencidos})
            </button>
          </div>

          {/* Filtro Tipo */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTypeFilter("todos")}
              className={`px-2 py-1 rounded-lg font-bold text-[10px] transition cursor-pointer ${
                typeFilter === "todos" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              Tudo
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("iptv")}
              className={`px-2 py-1 rounded-lg font-bold text-[10px] transition cursor-pointer ${
                typeFilter === "iptv" ? "bg-sky-600 text-white" : "text-sky-700 bg-sky-50 hover:bg-sky-100"
              }`}
            >
              IPTV
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("p2p")}
              className={`px-2 py-1 rounded-lg font-bold text-[10px] transition cursor-pointer ${
                typeFilter === "p2p" ? "bg-purple-600 text-white" : "text-purple-700 bg-purple-50 hover:bg-purple-100"
              }`}
            >
              P2P
            </button>
          </div>
        </div>
      </div>

      {/* Lista de Clientes */}
      {serverQuery.isLoading ? (
        <div className="bg-white rounded-2xl p-10 border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 text-[#FF5500] animate-spin" />
          <p className="text-xs font-semibold text-slate-600">Consultando clientes no servidor RBOYS...</p>
        </div>
      ) : serverQuery.isError ? (
        <div className="bg-white rounded-2xl p-6 border border-rose-100 shadow-sm flex flex-col items-center text-center gap-2">
          <AlertTriangle className="h-8 w-8 text-rose-500" />
          <p className="text-sm font-bold text-slate-800">Falha ao consultar servidor IPTV</p>
          <p className="text-xs text-slate-500 max-w-md">
            {(serverQuery.error as Error)?.message || "Verifique se a URL Base e a X-API-Key estão salvas corretamente na aba API e Integrações."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void serverQuery.refetch()}
            className="mt-2 text-xs font-bold rounded-xl"
          >
            Tentar novamente
          </Button>
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm text-center">
          <p className="text-sm font-bold text-slate-700">Nenhum cliente encontrado</p>
          <p className="text-xs text-slate-400 mt-1">
            {search ? "Tente alterar o termo de busca ou filtros." : "O servidor não retornou registros com os filtros atuais."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredClients.map((client) => {
            const isPendingThis = pendingClientId === String(client.id) && importClient.isPending;
            const localClient = localMap.get(client.username.toLowerCase());
            const isLinked = !!localClient;
            const hasDateDiff = isLinked && localClient.due_date !== client.due_date_str && client.due_date_str !== null;

            return (
              <div
                key={`${client.type}-${client.id}-${client.username}`}
                className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm hover:border-orange-100 transition flex flex-col gap-2.5"
              >
                {/* Linha superior: Login/Nome + Badges */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-sm text-slate-900 tracking-tight font-mono">
                        {client.username}
                      </span>
                      <span
                        className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                          client.type === "iptv" ? "bg-sky-50 text-sky-700 border border-sky-100" : "bg-purple-50 text-purple-700 border border-purple-100"
                        }`}
                      >
                        {client.type.toUpperCase()}
                      </span>
                      {(() => {
                        const isDueToday = client.is_due_today || client.status === "vencem_hoje";
                        const isExpired = client.is_expired || client.status === "vencido" || client.status === "expired";
                        const hasDate = Boolean(client.due_date_str && client.display_due && client.display_due !== "Sem vencimento");

                        if (!hasDate) {
                          return (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-100">
                              Sem Vencimento
                            </span>
                          );
                        }
                        if (isDueToday) {
                          return (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                              Vence Hoje
                            </span>
                          );
                        }
                        if (isExpired) {
                          return (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                              Vencido
                            </span>
                          );
                        }
                        return (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Ativo
                          </span>
                        );
                      })()}
                    </div>

                    {(client.name || client.notes) && (
                      <p className="text-xs text-slate-600 mt-0.5 truncate font-medium">
                        {client.name || client.notes}
                      </p>
                    )}
                  </div>

                  {/* Botão copiar login */}
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(client.username);
                      toast.success(`Usuário ${client.username} copiado!`);
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg shrink-0 cursor-pointer"
                    title="Copiar usuário"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Linha do Meio: Vencimento e Senha */}
                <div className="flex items-center justify-between gap-3 text-xs bg-slate-50/80 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <CalendarClock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="text-slate-500 text-[11px]">Vencimento:</span>
                    <span className="font-extrabold text-slate-900 font-mono">
                      {client.display_due}
                    </span>
                  </div>

                  {client.password && (
                    <div className="flex items-center gap-1.5 text-slate-600 font-mono text-[11px]">
                      <span className="text-slate-400 font-sans text-[10px]">Senha:</span>
                      <span className="font-bold">
                        {showSecrets ? client.password : "••••••••"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(client.password || "");
                          toast.success(`Senha copiada!`);
                        }}
                        className="p-1 hover:bg-slate-200/80 rounded cursor-pointer"
                        title="Copiar senha"
                      >
                        <Copy className="h-3 w-3 text-slate-400 hover:text-slate-700" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Rodapé / Ações de Vínculo e Importação */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                  <div>
                    {isLinked ? (
                      <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Vinculado no AJPVIP</span>
                        {localClient?.name && localClient.name !== client.username && (
                          <span className="text-slate-400 font-normal">({localClient.name})</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 font-medium">
                        Não cadastrado no banco local
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <CardErrorBoundary>
                      <ServerClientActions client={client} localClient={localClient} onChanged={onChanged} />
                    </CardErrorBoundary>
                    {hasDateDiff && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPendingThis}
                        onClick={() => importClient.mutate(client)}
                        className="h-8 rounded-xl text-[11px] font-bold border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 cursor-pointer"
                      >
                        {isPendingThis ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3 mr-1" />
                        )}
                        Sincronizar Data
                      </Button>
                    )}

                    {!isLinked ? (
                      <Button
                        size="sm"
                        disabled={isPendingThis}
                        onClick={() => importClient.mutate(client)}
                        className="h-8 bg-[#FF5500] hover:bg-[#E04B00] text-white rounded-xl text-[11px] font-bold shadow-sm shadow-[#FF5500]/20 cursor-pointer"
                      >
                        {isPendingThis ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <UserPlus className="h-3 w-3 mr-1" />
                        )}
                        Vincular / Importar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isPendingThis}
                        onClick={() => importClient.mutate(client)}
                        className="h-8 text-[11px] font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
                      >
                        {isPendingThis ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                        Re-sincronizar
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */
/* MODAIS DE CLIENTE (CADASTRAR / EDITAR / RENOVAR)                           */
/* ========================================================================== */
function ClientFormDialog({
  open,
  onOpenChange,
  editing,
  plans,
  servers,
  defaultDue,
  onSaved,
  onCreatedServerAccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: AdminClientRow | null;
  plans: AdminPlanRow[];
  servers: AdminServerRow[];
  defaultDue: string;
  onSaved: () => void;
  onCreatedServerAccess?: (result: CreatedServerClientResult) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [iptvLogin, setIptvLogin] = useState("");
  const [iptvPassword, setIptvPassword] = useState("");
  const [planId, setPlanId] = useState("");
  const [serverId, setServerId] = useState("");
  const [price, setPrice] = useState("30,00");
  const [points, setPoints] = useState("1");
  const [dueDate, setDueDate] = useState(defaultDue);
  const [autoCharge, setAutoCharge] = useState(true);
  const [notes, setNotes] = useState("");
  const [referredByCode, setReferredByCode] = useState("");

  // Integração com Servidor RBOYS
  const [createOnServer, setCreateOnServer] = useState(true);
  const [serviceType, setServiceType] = useState<"IPTV" | "P2P">("IPTV");
  const [modality, setModality] = useState<"client" | "trial">("client");
  const [serverPlanId, setServerPlanId] = useState("");

  // Consulta de planos disponíveis no servidor em tempo real
  const serverPlansQuery = useQuery({
    queryKey: ["portal", "admin", "server-plans", serviceType],
    queryFn: () =>
      adminPost<{
        ok: boolean;
        server_name: string;
        plans: NormalizedServerPlan[];
      }>("get_server_plans", { type: serviceType }),
    staleTime: 60000,
    enabled: open && !editing,
  });

  const availablePlans = useMemo(() => {
    const list = serverPlansQuery.data?.plans ?? [];
    if (modality === "trial") {
      const trials = list.filter((p) => p.is_trial);
      return trials.length > 0 ? trials : list;
    }
    const regulars = list.filter((p) => !p.is_trial);
    return regulars.length > 0 ? regulars : list;
  }, [serverPlansQuery.data?.plans, modality]);

  // Pré-seleciona o primeiro plano e ajusta valor sugerido
  React.useEffect(() => {
    if (!open || editing) return;
    if (availablePlans.length > 0) {
      const currentSelected = availablePlans.find((p) => String(p.id) === String(serverPlanId));
      if (!currentSelected) {
        const first = availablePlans[0];
        setServerPlanId(String(first.id));
        if (first.price_cents !== undefined) {
          setPrice((first.price_cents / 100).toFixed(2).replace(".", ","));
        } else if (modality === "trial") {
          setPrice("0,00");
        }
      }
    }
  }, [open, editing, availablePlans, serverPlanId, modality]);

  React.useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setPhone(editing.phone);
      setIptvLogin(editing.iptv_login ?? "");
      setIptvPassword(editing.iptv_password ?? "");
      setPlanId(editing.plan_id ?? "");
      setServerId(editing.server_id ?? "");
      setPrice((editing.price_cents / 100).toFixed(2).replace(".", ","));
      setPoints(String(editing.points ?? 1));
      setDueDate(editing.due_date || defaultDue);
      setAutoCharge(editing.auto_charge !== false);
      setNotes(editing.notes ?? "");
      setReferredByCode(editing.referred_by_code ?? "");
      setCreateOnServer(false);
    } else {
      setName("");
      setPhone("");
      setIptvLogin("");
      setIptvPassword("");
      setPlanId("");
      setServerId("");
      setPrice("30,00");
      setPoints("1");
      setDueDate(defaultDue);
      setAutoCharge(true);
      setNotes("");
      setReferredByCode("");
      setCreateOnServer(true);
      setModality("client");
      setServiceType("IPTV");
    }
  }, [open, editing, defaultDue]);

  const save = useMutation({
    mutationFn: async () => {
      // Criação automatizada direto no servidor RBOYS
      if (!editing && createOnServer) {
        const res = await adminPost<CreatedServerClientResult>("create_server_client", {
          type: serviceType,
          is_trial: modality === "trial",
          plan_id: serverPlanId || undefined,
          name: name.trim(),
          phone: phone.trim(),
          username: iptvLogin.trim() || undefined,
          password: iptvPassword.trim() || undefined,
          notes: notes.trim() || undefined,
          price_cents: parseBrlToCents(price),
        });
        return { isServer: true, result: res };
      }

      // Criação ou edição padrão local
      await adminPost(editing ? "update_client" : "create_client", {
        id: editing?.id,
        name,
        phone,
        iptv_login: iptvLogin,
        iptv_password: iptvPassword,
        plan_id: planId || null,
        server_id: serverId || null,
        price_cents: parseBrlToCents(price),
        points: Number(points) || 1,
        due_date: dueDate,
        auto_charge: autoCharge,
        notes,
        status: editing?.status,
        referred_by_code: referredByCode.trim().toUpperCase(),
        clear_referral: Boolean(editing?.referred_by_code && !referredByCode.trim()),
      });
      return { isServer: false };
    },
    onSuccess: (data) => {
      onOpenChange(false);
      onSaved();
      if (data.isServer && data.result) {
        toast.success(
          data.result.is_trial
            ? "Teste gerado com sucesso no servidor!"
            : "Cliente criado e vinculado com sucesso!"
        );
        onCreatedServerAccess?.(data.result);
      } else {
        toast.success(editing ? "Cliente atualizado!" : "Cliente cadastrado!");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pointOptions = Array.from(
    new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, Math.max(1, Number(points) || 1)]),
  ).sort((a, b) => a - b);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={PORTAL_MODAL_CLASS}>
        <DialogHeader className="sr-only">
          <DialogTitle>{editing ? "Editar Cliente" : "Cadastrar Novo Cliente"}</DialogTitle>
        </DialogHeader>
        <PortalModalHeader
          title={editing ? "Editar Cliente" : "Cadastrar Novo Cliente"}
          subtitle={
            editing
              ? `Atualizando cadastro de ${editing.name}`
              : "Preencha os dados para ativar o assinante"
          }
          onClose={() => onOpenChange(false)}
        />

        <div className="p-4 space-y-3 overflow-y-auto max-h-[calc(90dvh-142px)]">
          {/* Opção de Geração Automática no Servidor */}
          {!editing && (
            <div className="bg-gradient-to-r from-orange-50/70 via-white to-amber-50/70 rounded-2xl p-3.5 shadow-sm border border-orange-100 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-[#FF5500]" />
                    <p className="text-xs font-black text-slate-900 tracking-tight">
                      Criar acesso automaticamente no Servidor (RBOYS)
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Gera login, senha e vencimento exato via API do servidor
                  </p>
                </div>
                <Switch
                  checked={createOnServer}
                  onCheckedChange={setCreateOnServer}
                  className={PORTAL_SWITCH_CLASS}
                />
              </div>

              {createOnServer && (
                <div className="space-y-2.5 pt-2 border-t border-orange-100/70 animate-in fade-in duration-150">
                  {/* Tipo de Serviço: IPTV vs P2P */}
                  <div>
                    <Label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Tipo de Serviço
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setServiceType("IPTV")}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          serviceType === "IPTV"
                            ? "bg-sky-600 text-white shadow-sm"
                            : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <Tv className="h-3.5 w-3.5" />
                        IPTV
                      </button>
                      <button
                        type="button"
                        onClick={() => setServiceType("P2P")}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          serviceType === "P2P"
                            ? "bg-purple-600 text-white shadow-sm"
                            : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <Radio className="h-3.5 w-3.5" />
                        P2P
                      </button>
                    </div>
                  </div>

                  {/* Modalidade: Oficial vs Teste */}
                  <div>
                    <Label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Modalidade do Acesso
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setModality("client");
                          setAutoCharge(true);
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          modality === "client"
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        Cliente Oficial
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setModality("trial");
                          setPrice("0,00");
                          setAutoCharge(false);
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          modality === "trial"
                            ? "bg-amber-600 text-white shadow-sm"
                            : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Teste Grátis
                      </button>
                    </div>
                  </div>

                  {/* Plano no Servidor */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className={PORTAL_LABEL_CLASS}>Plano no Servidor (RBOYS)</Label>
                      {serverPlansQuery.isFetching && (
                        <span className="text-[10px] text-[#FF5500] font-semibold flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> Atualizando planos...
                        </span>
                      )}
                    </div>
                    <select
                      value={serverPlanId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setServerPlanId(id);
                        const sel = availablePlans.find((p) => String(p.id) === id);
                        if (sel && sel.price_cents !== undefined) {
                          setPrice((sel.price_cents / 100).toFixed(2).replace(".", ","));
                        }
                      }}
                      className={PORTAL_SELECT_CLASS}
                    >
                      {availablePlans.length === 0 ? (
                        <option value="">
                          {serverPlansQuery.isLoading ? "Carregando planos..." : "Nenhum plano retornado pela API"}
                        </option>
                      ) : (
                        availablePlans.map((p) => (
                          <option key={String(p.id)} value={String(p.id)}>
                            {p.name}
                            {p.price_cents ? ` (${brl(p.price_cents)})` : ""}
                            {p.duration_days ? ` - ${p.duration_days} dias` : p.duration_hours ? ` - ${p.duration_hours}h` : ""}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dados do Assinante */}
          <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100 space-y-3">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Dados do Assinante
            </p>
            <div>
              <Label className={PORTAL_LABEL_CLASS}>Nome completo *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do assinante ou apelido"
                className={PORTAL_INPUT_CLASS}
              />
            </div>
            <div>
              <Label className={PORTAL_LABEL_CLASS}>WhatsApp (com DDD) *</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ex.: 16997855438"
                inputMode="tel"
                className={PORTAL_INPUT_CLASS}
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Utilizado para envio da mensagem de acesso e lembretes automáticos.
              </p>
            </div>
          </div>

          {/* Plano, Servidor e IPTV */}
          <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100 space-y-3">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              {createOnServer ? "Credenciais e Valores" : "Plano, Servidor e IPTV"}
            </p>

            {!createOnServer && (
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <Label className={PORTAL_LABEL_CLASS}>Plano Local</Label>
                  <select
                    value={planId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setPlanId(id);
                      const found = plans.find((p) => p.id === id);
                      if (found) setPrice((found.price_cents / 100).toFixed(2).replace(".", ","));
                    }}
                    className={PORTAL_SELECT_CLASS}
                  >
                    <option value="">
                      {plans.length > 0 ? "Selecionar plano..." : "Sem planos"}
                    </option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({brl(p.price_cents)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className={PORTAL_LABEL_CLASS}>Servidor</Label>
                  <select
                    value={serverId}
                    onChange={(e) => setServerId(e.target.value)}
                    className={PORTAL_SELECT_CLASS}
                  >
                    <option value="">
                      {servers.length > 0 ? "Selecionar servidor..." : "Sem servidores"}
                    </option>
                    {servers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <Label className={PORTAL_LABEL_CLASS}>
                  Login {createOnServer ? "(Opcional)" : "IPTV"}
                </Label>
                <Input
                  value={iptvLogin}
                  onChange={(e) => setIptvLogin(e.target.value)}
                  placeholder={createOnServer ? "Deixe vazio para gerar" : "Usuário"}
                  className={PORTAL_INPUT_CLASS}
                />
              </div>
              <div>
                <Label className={PORTAL_LABEL_CLASS}>
                  Senha {createOnServer ? "(Opcional)" : "IPTV"}
                </Label>
                <Input
                  value={iptvPassword}
                  onChange={(e) => setIptvPassword(e.target.value)}
                  placeholder={createOnServer ? "Deixe vazio para gerar" : "Senha"}
                  className={PORTAL_INPUT_CLASS}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className={PORTAL_LABEL_CLASS}>Valor (R$)</Label>
                <Input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="30,00"
                  className={PORTAL_INPUT_CLASS}
                />
              </div>
              <div>
                <Label className={PORTAL_LABEL_CLASS}>Telas</Label>
                <select
                  value={String(Math.max(1, Number(points) || 1))}
                  onChange={(e) => setPoints(e.target.value)}
                  className={PORTAL_SELECT_CLASS}
                >
                  {pointOptions.map((n) => (
                    <option key={n} value={String(n)}>
                      {n} {n === 1 ? "Tela" : "Telas"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className={PORTAL_LABEL_CLASS}>
                  Vencimento {createOnServer ? "(Automático)" : ""}
                </Label>
                <Input
                  type="date"
                  value={dueDate}
                  disabled={createOnServer}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={`${PORTAL_INPUT_CLASS} ${createOnServer ? "opacity-60 bg-slate-100" : ""}`}
                />
              </div>
            </div>
            {createOnServer && (
              <p className="text-[10px] text-slate-400">
                A data de vencimento será calculada e gravada exatamente conforme retornado pela API do RBOYS.
              </p>
            )}
          </div>

          {/* Indicação & Cobrança */}
          <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100 space-y-3">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Indicação e Observações
            </p>

            <div>
              <Label className={`${PORTAL_LABEL_CLASS} flex items-center gap-1.5`}>
                <Gift className="h-3.5 w-3.5 text-[#FF5500]" />
                Código de indicação (opcional)
              </Label>
              <Input
                value={referredByCode}
                onChange={(e) => setReferredByCode(e.target.value.toUpperCase())}
                placeholder="Ex.: ABC123"
                maxLength={20}
                autoCapitalize="characters"
                className={`${PORTAL_INPUT_CLASS} uppercase font-bold tracking-wider`}
              />
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                Se o cliente foi indicado, informe o código. O indicador ganha dias bônus ao 1º pagamento.
              </p>
            </div>

            <div>
              <Label className={PORTAL_LABEL_CLASS}>Observações</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Anotações internas sobre o cliente..."
                className={PORTAL_TEXTAREA_CLASS}
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800">Cobrança Automática WhatsApp</p>
                <p className="text-[10px] text-slate-500">Lembrete automático antes do vencimento</p>
              </div>
              <Switch
                checked={autoCharge}
                onCheckedChange={setAutoCharge}
                className={PORTAL_SWITCH_CLASS}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="bg-white border-t border-slate-200 px-4 py-3 sm:justify-stretch">
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="w-full bg-[#FF5500] hover:bg-[#E04B00] text-white rounded-xl font-extrabold h-11 shadow-md shadow-[#FF5500]/25 cursor-pointer"
          >
            {save.isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {createOnServer ? "Criando no servidor..." : "Salvando..."}
              </span>
            ) : editing ? (
              "Salvar Alterações"
            ) : createOnServer ? (
              modality === "trial" ? "Gerar Teste Grátis no Servidor" : "Cadastrar Cliente no Servidor"
            ) : (
              "Cadastrar Cliente"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ========================================================================== */
/* MODAL: RESUMO DO ACESSO CRIADO (SUCESSO & WHATSAPP)                        */
/* ========================================================================== */
function CreatedAccessDialog({
  access,
  onClose,
}: {
  access: CreatedServerClientResult | null;
  onClose: () => void;
}) {
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);

  if (!access) return null;

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(access.message);
      toast.success("Mensagem completa de acesso copiada com sucesso!");
    } catch {
      toast.error("Não foi possível copiar automaticamente.");
    }
  };

  const handleSendWhatsappEvolution = async () => {
    setSendingWhatsapp(true);
    try {
      // Tenta enviar diretamente pela Evolution API configurada
      await adminPost("send_client_whatsapp", {
        phone: access.raw?.phone || access.username,
        message: access.message,
      });
      toast.success("Mensagem enviada com sucesso no WhatsApp do cliente!");
    } catch (err: any) {
      toast.error(err.message || "Falha ao enviar pelo WhatsApp Evolution.");
    } finally {
      setSendingWhatsapp(false);
    }
  };

  const handleOpenWhatsappWeb = () => {
    const rawPhone = access.raw?.phone || "";
    const cleanPhone = rawPhone.replace(/\D/g, "");
    const targetPhone = cleanPhone.length >= 10 && !cleanPhone.startsWith("55") ? `55${cleanPhone}` : cleanPhone;
    const url = `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(access.message)}`;
    window.open(url, "_blank");
  };

  return (
    <Dialog open={!!access} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] p-0 overflow-hidden rounded-3xl flex flex-col gap-0 border-slate-100">
        <div className="p-4 sm:p-5 bg-gradient-to-b from-emerald-50/80 via-white to-white border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                  Acesso Criado com Sucesso!
                </h3>
                <p className="text-xs text-slate-500">
                  Gerado no servidor <span className="font-bold text-slate-700">{access.server_name}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                access.type === "IPTV"
                  ? "bg-sky-50 text-sky-700 border border-sky-100"
                  : "bg-purple-50 text-purple-700 border border-purple-100"
              }`}
            >
              {access.type}
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                access.is_trial
                  ? "bg-amber-50 text-amber-700 border border-amber-100"
                  : "bg-emerald-50 text-emerald-700 border border-emerald-100"
              }`}
            >
              {access.is_trial ? "Teste Grátis" : "Oficial"}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 max-h-[60vh]">
          {/* Cartão de Credenciais */}
          <div className="bg-slate-50/80 rounded-2xl p-3.5 border border-slate-100 space-y-2.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Credenciais de Acesso
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white rounded-xl p-2.5 border border-slate-200/80 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-slate-400">Usuário</p>
                  <p className="font-mono font-bold text-xs text-slate-900 mt-0.5 select-all">
                    {access.username}
                  </p>
                </div>
                <button
                  type="button"
                  title="Copiar usuário"
                  onClick={() => {
                    void navigator.clipboard.writeText(access.username);
                    toast.success("Usuário copiado!");
                  }}
                  className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="bg-white rounded-xl p-2.5 border border-slate-200/80 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-slate-400">Senha</p>
                  <p className="font-mono font-bold text-xs text-slate-900 mt-0.5 select-all">
                    {access.password}
                  </p>
                </div>
                <button
                  type="button"
                  title="Copiar senha"
                  onClick={() => {
                    void navigator.clipboard.writeText(access.password);
                    toast.success("Senha copiada!");
                  }}
                  className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white rounded-xl p-2.5 border border-slate-200/80">
                <p className="text-[10px] text-slate-400">Vencimento (Brasília)</p>
                <p className="font-bold text-slate-900 mt-0.5">
                  {access.display_due}
                </p>
              </div>
              {access.dns ? (
                <div className="bg-white rounded-xl p-2.5 border border-slate-200/80">
                  <p className="text-[10px] text-slate-400">DNS / Servidor</p>
                  <p className="font-mono text-[11px] text-slate-900 mt-0.5 truncate select-all">
                    {access.dns}
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-xl p-2.5 border border-slate-200/80">
                  <p className="text-[10px] text-slate-400">Status Local</p>
                  <p className="font-bold text-emerald-600 mt-0.5">Vinculado no AJPVIP</p>
                </div>
              )}
            </div>
          </div>

          {/* Preview da Mensagem Pronta para WhatsApp */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className={PORTAL_LABEL_CLASS}>
                Mensagem Pronta para Envio (WhatsApp)
              </Label>
              <button
                type="button"
                onClick={handleCopyMessage}
                className="text-[11px] font-bold text-[#FF5500] hover:text-[#E04B00] flex items-center gap-1 cursor-pointer"
              >
                <Copy className="h-3 w-3" /> Copiar texto
              </button>
            </div>
            <textarea
              readOnly
              value={access.message}
              rows={6}
              className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-2xl p-3 focus:outline-none select-all text-slate-800 leading-relaxed"
            />
          </div>
        </div>

        {/* Rodapé com Ações de Envio e Fechamento */}
        <div className="p-3 sm:px-5 bg-white border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="rounded-xl text-xs font-bold order-2 sm:order-1"
          >
            Concluir
          </Button>

          <div className="flex items-center gap-2 order-1 sm:order-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCopyMessage}
              className="flex-1 sm:flex-none rounded-xl text-xs font-bold border-slate-200 hover:bg-slate-50 cursor-pointer"
            >
              <Copy className="h-3.5 w-3.5 mr-1 text-slate-600" />
              Copiar Mensagem
            </Button>

            <Button
              type="button"
              disabled={sendingWhatsapp}
              onClick={handleSendWhatsappEvolution}
              className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-emerald-600/20 cursor-pointer"
            >
              {sendingWhatsapp ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5 mr-1" />
              )}
              Enviar no WhatsApp agora
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RenewClientDialog({
  client,
  plans,
  onClose,
  onRenewed,
}: {
  client: AdminClientRow | null;
  plans: AdminPlanRow[];
  onClose: () => void;
  onRenewed: () => void;
}) {
  const renew = useMutation({
    mutationFn: ({ c, days }: { c: AdminClientRow; days: number }) => {
      const currentPlan = plans.find((p) => p.id === c.plan_id);
      const months = Math.max(1, Math.round(days / 30));
      const curMonths = currentPlan ? Math.max(1, Math.round(currentPlan.duration_days / 30)) : 1;
      const matching = plans.find((p) => p.duration_days === days);
      const amountCents = matching
        ? matching.price_cents
        : Math.round((c.price_cents || 3000) / curMonths) * months;
      return adminPost("renew_client", {
        client_id: c.id,
        days,
        amount_cents: amountCents,
        notes: `Renovação ${days} dias (Portal ADM)`,
      });
    },
    onSuccess: () => {
      toast.success("Cliente renovado e pagamento registrado!");
      onClose();
      onRenewed();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!client) return null;

  return (
    <Dialog open={Boolean(client)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={`${PORTAL_MODAL_CLASS} max-w-sm`}>
        <DialogHeader className="sr-only">
          <DialogTitle>Renovar Assinatura</DialogTitle>
        </DialogHeader>
        <PortalModalHeader
          title="Renovar Assinatura"
          subtitle={client.name}
          onClose={onClose}
        />
        <div className="p-4 space-y-3">
          <div className="bg-white rounded-2xl p-3.5 text-xs shadow-sm border border-slate-100 space-y-1">
            <p className="font-extrabold text-slate-900">{client.name}</p>
            <p className="text-slate-500">
              Vencimento atual: <strong className="text-slate-800">{formatDateBR(client.due_date)}</strong> · Valor:{" "}
              <strong className="text-slate-800">{brl(client.price_cents)}</strong>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: "+1 Mês (30d)", days: 30 },
              { label: "+3 Meses (90d)", days: 90 },
              { label: "+6 Meses (180d)", days: 180 },
              { label: "+1 Ano (365d)", days: 365 },
            ].map((opt) => (
              <Button
                key={opt.days}
                disabled={renew.isPending}
                onClick={() => renew.mutate({ c: client, days: opt.days })}
                className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm cursor-pointer"
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ========================================================================== */
/* MODAL: CLIENTES ONLINE (ASSISTINDO AGORA)                                  */
/* ========================================================================== */
function OnlineConnectionsDialog({
  open,
  onOpenChange,
  query,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: {
    data?: {
      ok: boolean;
      server_name: string;
      total: number;
      connections: NormalizedServerConnection[];
    };
    isLoading: boolean;
    isFetching: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => Promise<unknown>;
  };
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"todos" | "iptv" | "p2p">("todos");

  const connections = query.data?.connections ?? [];
  const serverName = query.data?.server_name || "RBOYS";

  const iptvCount = useMemo(() => connections.filter((c) => c.type === "IPTV").length, [connections]);
  const p2pCount = useMemo(() => connections.filter((c) => c.type === "P2P").length, [connections]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return connections.filter((c) => {
      if (typeFilter !== "todos" && c.type.toLowerCase() !== typeFilter) {
        return false;
      }
      if (term) {
        const matchUser = c.username.toLowerCase().includes(term);
        const matchChannel = c.channel.toLowerCase().includes(term);
        const matchIp = c.ip?.toLowerCase().includes(term);
        const matchDevice = c.device?.toLowerCase().includes(term);
        if (!matchUser && !matchChannel && !matchIp && !matchDevice) {
          return false;
        }
      }
      return true;
    });
  }, [connections, search, typeFilter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[85vh] p-0 overflow-hidden rounded-3xl flex flex-col gap-0 border-slate-100">
        {/* Header com estilo elegante */}
        <div className="p-4 sm:p-5 bg-gradient-to-b from-slate-50 to-white border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                Clientes Online (Assistindo Agora)
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {query.data?.total ?? 0} conexões ativas no servidor{" "}
              <span className="font-bold text-slate-700">{serverName}</span>
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
            className="h-8 px-2.5 rounded-xl text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${query.isFetching ? "animate-spin text-[#FF5500]" : "text-slate-500"}`} />
            Atualizar
          </Button>
        </div>

        {/* Barra de Busca e Filtros */}
        <div className="p-3 sm:px-5 border-b border-slate-100 bg-white space-y-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por usuário, canal ou IP..."
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#FF5500] focus:bg-white transition"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setTypeFilter("todos")}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                typeFilter === "todos"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Todos ({connections.length})
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("iptv")}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                typeFilter === "iptv"
                  ? "bg-sky-600 text-white"
                  : "bg-sky-50 text-sky-700 hover:bg-sky-100"
              }`}
            >
              IPTV ({iptvCount})
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("p2p")}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                typeFilter === "p2p"
                  ? "bg-purple-600 text-white"
                  : "bg-purple-50 text-purple-700 hover:bg-purple-100"
              }`}
            >
              P2P ({p2pCount})
            </button>
          </div>
        </div>

        {/* Lista de Conexões */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-2.5 max-h-[50vh]">
          {query.isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-center">
              <Loader2 className="h-8 w-8 text-[#FF5500] animate-spin" />
              <p className="text-xs font-semibold text-slate-500">Consultando conexões em tempo real...</p>
            </div>
          ) : query.isError ? (
            <div className="py-8 px-4 text-center space-y-2">
              <AlertTriangle className="h-8 w-8 text-rose-500 mx-auto" />
              <p className="text-sm font-bold text-slate-800">Falha ao obter conexões do servidor</p>
              <p className="text-xs text-slate-500">
                {(query.error as Error)?.message || "Verifique se a API do servidor está respondendo."}
              </p>
            </div>
          ) : connections.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Tv className="h-6 w-6" />
              </div>
              <p className="text-sm font-bold text-slate-700">Nenhum cliente assistindo agora</p>
              <p className="text-xs text-slate-400">
                Assim que algum cliente abrir um canal ou filme no aplicativo, ele aparecerá aqui instantaneamente.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Nenhuma conexão encontrada para a busca "{search}".
            </div>
          ) : (
            filtered.map((conn) => (
              <div
                key={`${conn.type}-${conn.id}-${conn.username}`}
                className="bg-white rounded-2xl p-3 border border-slate-100 hover:border-emerald-200 transition shadow-sm space-y-2"
              >
                {/* Linha superior: Usuário + Badges */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-extrabold text-xs text-slate-900 font-mono truncate">
                      {conn.username}
                    </span>
                    <span
                      className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                        conn.type === "iptv"
                          ? "bg-sky-50 text-sky-700 border border-sky-100"
                          : "bg-purple-50 text-purple-700 border border-purple-100"
                      }`}
                    >
                      {conn.type}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {conn.duration}
                    </span>
                    <button
                      type="button"
                      title="Copiar usuário"
                      onClick={() => {
                        void navigator.clipboard.writeText(conn.username);
                        toast.success(`Usuário ${conn.username} copiado!`);
                      }}
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded cursor-pointer"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Conteúdo sendo assistido */}
                <div className="bg-slate-50 rounded-xl px-2.5 py-1.5 flex items-center gap-2 text-xs">
                  <PlayCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="font-bold text-slate-800 truncate">
                    {conn.channel}
                  </span>
                </div>

                {/* Dispositivo e IP (se disponíveis) */}
                {(conn.device || conn.ip) && (
                  <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 px-0.5">
                    <span className="truncate max-w-[65%]">
                      {conn.device ? conn.device : ""}
                    </span>
                    {conn.ip && (
                      <span className="font-mono text-slate-500 shrink-0">
                        IP: {conn.ip}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Rodapé */}
        <div className="p-3 sm:px-5 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="rounded-xl text-xs font-bold"
          >
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
