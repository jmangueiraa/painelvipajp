import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CalendarClock,
  CheckCircle2,
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
  Plug,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Send,
  Server as ServerIcon,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Trash2,
  TrendingUp,
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
import {
  buildChargeMessage,
  buildWhatsAppHref,
  handleAndroidWhatsAppIntent,
  normalizeBrPhone,
} from "@/lib/whatsapp-message";

export type AdminSubView = "home" | "loja" | "apis" | "apk" | "config" | "iptv";
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
    zapi_instance_id: string;
    zapi_token: string;
    zapi_client_token: string;
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

export function PortalAdminPanel({
  activeTab,
  onTabChange,
  onLogout,
  adminName = "Administrador",
}: PortalAdminPanelProps) {
  const qc = useQueryClient();
  const [subView, setSubView] = useState<AdminSubView>("home");
  const [clientFilter, setClientFilter] = useState<ClientFilter>("todos");
  const [clientSearch, setClientSearch] = useState("");
  const [clientFormOpen, setClientFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<AdminClientRow | null>(null);
  const [renewTarget, setRenewTarget] = useState<AdminClientRow | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useQuery<AdminSnapshot>({
    queryKey: ["portal", "admin", "snapshot"],
    queryFn: () => portalFetch<AdminSnapshot>("/api/public/portal/admin"),
    staleTime: 30_000,
    retry: 1,
  });

  const invalidateAdmin = () => {
    void qc.invalidateQueries({ queryKey: ["portal", "admin"] });
    void qc.invalidateQueries({ queryKey: ["portal", "me"] });
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
              onClick={() => void refetch()}
              aria-label="Atualizar dados do painel"
              className="w-9 h-9 rounded-xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-center text-slate-600 hover:text-[#FF5500] cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin text-[#FF5500]" : ""}`} />
            </button>
          </div>

          {/* Card Duplo: Área Administrativa Ativa + Painel do Administrador */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="bg-[#E3F3EB] px-4 py-2.5 flex items-center gap-2 border-b border-emerald-200/50">
              <Users className="h-4 w-4 text-emerald-700 shrink-0" />
              <span className="text-xs font-bold text-emerald-800">Área Administrativa Ativa</span>
            </div>
            <div className="px-4 py-4">
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
                Painel do Administrador
              </h2>
            </div>
          </div>

          {/* Visão geral do negócio */}
          <div className="space-y-2.5">
            <h3 className="text-sm font-extrabold text-slate-900 px-0.5">Visão geral do negócio</h3>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => openClientsWithFilter("todos")}
                className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100 flex items-center justify-between text-left hover:border-slate-200 active:scale-[0.98] transition cursor-pointer"
              >
                <div>
                  <p className="text-[11px] font-medium text-slate-600">Total de clientes</p>
                  <p className="text-2xl font-black text-slate-900 mt-0.5 leading-none">
                    {data.kpis.total}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                  <Users className="h-5 w-5" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => openClientsWithFilter("ativos")}
                className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100 flex items-center justify-between text-left hover:border-emerald-200 active:scale-[0.98] transition cursor-pointer"
              >
                <div>
                  <p className="text-[11px] font-medium text-slate-600">Clientes ativos</p>
                  <p className="text-2xl font-black text-slate-900 mt-0.5 leading-none">
                    {data.kpis.ativos}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-100/80 text-emerald-600 flex items-center justify-center shrink-0">
                  <UserCheck className="h-5 w-5" />
                </div>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => openClientsWithFilter("vencidos")}
                className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex items-center justify-between text-left hover:border-rose-200 active:scale-[0.98] transition cursor-pointer"
              >
                <div>
                  <p className="text-[11px] font-medium text-slate-600 leading-tight">Vencidos</p>
                  <p className="text-xl font-black text-slate-900 mt-1 leading-none">
                    {data.kpis.vencidos}
                  </p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-rose-100/80 text-rose-500 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4 w-4" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => openClientsWithFilter("vencem_hoje")}
                className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex items-center justify-between text-left hover:border-amber-200 active:scale-[0.98] transition cursor-pointer"
              >
                <div>
                  <p className="text-[11px] font-medium text-slate-600 leading-tight">
                    Vencem
                    <br />
                    hoje
                  </p>
                  <p className="text-xl font-black text-slate-900 mt-0.5 leading-none">
                    {data.kpis.hoje}
                  </p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-amber-100/80 text-amber-600 flex items-center justify-center shrink-0">
                  <CalendarClock className="h-4 w-4" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => openClientsWithFilter("a_vencer_mes")}
                className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex items-center justify-between text-left hover:border-sky-200 active:scale-[0.98] transition cursor-pointer"
              >
                <div>
                  <p className="text-[11px] font-medium text-slate-600 leading-tight">
                    A vencer no
                    <br />
                    mês
                  </p>
                  <p className="text-xl font-black text-slate-900 mt-0.5 leading-none">
                    {data.kpis.mes}
                  </p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-sky-100/80 text-sky-600 flex items-center justify-center shrink-0">
                  <Calendar className="h-4 w-4" />
                </div>
              </button>
            </div>
          </div>

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

          {/* Cards de rodapé idênticos à imagem */}
          <div className="space-y-2.5 pt-0.5">
            <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-orange-50 text-[#FF5500] flex items-center justify-center shrink-0">
                  <Headphones className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-slate-900 truncate">
                    Atendimento ao Cliente
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    Suporte humanizado todos os dias
                  </p>
                </div>
              </div>
              {data.settings.whatsapp_instance ? (
                <a
                  href={buildWhatsAppHref(
                    data.settings.whatsapp_instance,
                    "Olá! Preciso de atendimento no Painel ADM.",
                  )}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    if (
                      handleAndroidWhatsAppIntent(
                        data.settings.whatsapp_instance,
                        "Olá! Preciso de atendimento no Painel ADM.",
                      )
                    ) {
                      e.preventDefault();
                    }
                  }}
                  className="text-xs font-bold text-[#FF5500] shrink-0 hover:underline"
                >
                  Falar agora
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => setSubView("config")}
                  className="text-xs font-bold text-[#FF5500] shrink-0 hover:underline cursor-pointer"
                >
                  Configurar
                </button>
              )}
            </div>

            <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-slate-900 truncate">
                    Dados de Conexão IPTV
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {data.kpis.iptv_configured} acessos cadastrados · {data.servers.length} servidor(es)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSubView("iptv")}
                className="text-xs font-bold text-[#FF5500] shrink-0 hover:underline cursor-pointer"
              >
                Ver credenciais
              </button>
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
              { label: "API e Integrações (MP, Telegram, Z-API)", view: "apis" as AdminSubView, icon: Plug },
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
      <ClientFormDialog
        open={clientFormOpen}
        onOpenChange={setClientFormOpen}
        editing={editingClient}
        plans={data.plans}
        servers={data.servers}
        defaultDue={data.today || todayISO()}
        onSaved={invalidateAdmin}
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
  badgeClass,
  icon,
  onClick,
}: {
  label: string;
  badgeClass: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white rounded-2xl py-3 px-1.5 shadow-sm border border-slate-100 flex flex-col items-center justify-start gap-1.5 text-center hover:border-orange-200 active:scale-95 transition cursor-pointer min-h-[92px]"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${badgeClass}`}>
        {icon}
      </div>
      <span className="text-[11px] font-bold text-slate-700 leading-tight break-words">{label}</span>
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
          <p className="text-[11px] text-slate-500 font-medium">Lucro no ano</p>
          <p className="text-lg font-black text-sky-600 mt-0.5">{brl(f.lucroAno)}</p>
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
  const [zInst, setZInst] = useState(data.settings.zapi_instance_id);
  const [zTok, setZTok] = useState(data.settings.zapi_token);
  const [zCli, setZCli] = useState(data.settings.zapi_client_token);
  const [showSecrets, setShowSecrets] = useState(false);

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

  const zapiStatus = useQuery({
    queryKey: ["portal", "admin", "zapi-status"],
    queryFn: () => adminPost<{ configured: boolean; connected: boolean }>("zapi_status"),
    retry: false,
  });

  const zapiQr = useQuery({
    queryKey: ["portal", "admin", "zapi-qr"],
    queryFn: () => adminPost<{ configured: boolean; connected: boolean; image: string | null }>("zapi_qr"),
    enabled: zapiStatus.data?.configured === true && zapiStatus.data?.connected === false,
    retry: false,
  });

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      <SubViewHeader
        title="API e Integrações"
        subtitle="Mercado Pago, Telegram e WhatsApp Z-API"
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

      {/* Z-API WhatsApp */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-extrabold text-slate-900">WhatsApp (Z-API)</p>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              zapiStatus.data?.connected
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {zapiStatus.data?.connected ? "Conectado" : "Desconectado"}
          </span>
        </div>
        <div>
          <Label className={PORTAL_LABEL_CLASS}>Instance ID</Label>
          <Input
            value={zInst}
            onChange={(e) => setZInst(e.target.value)}
            placeholder="Instance ID"
            className={PORTAL_INPUT_CLASS}
          />
        </div>
        <div>
          <Label className={PORTAL_LABEL_CLASS}>Token da Instância</Label>
          <Input
            type={showSecrets ? "text" : "password"}
            value={zTok}
            onChange={(e) => setZTok(e.target.value)}
            placeholder="Token da instância"
            className={PORTAL_INPUT_CLASS}
          />
        </div>
        <div>
          <Label className={PORTAL_LABEL_CLASS}>Client-Token (opcional)</Label>
          <Input
            type={showSecrets ? "text" : "password"}
            value={zCli}
            onChange={(e) => setZCli(e.target.value)}
            placeholder="Client-Token (opcional)"
            className={PORTAL_INPUT_CLASS}
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={savePatch.isPending}
            onClick={() =>
              savePatch.mutate({
                zapi_instance_id: zInst,
                zapi_token: zTok,
                zapi_client_token: zCli,
              })
            }
            className="h-9 bg-[#FF5500] hover:bg-[#E04B00] text-white rounded-xl text-xs font-bold shadow-sm shadow-[#FF5500]/20 cursor-pointer"
          >
            Salvar WhatsApp
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void zapiStatus.refetch()}
            className="h-9 rounded-xl text-xs font-bold bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Status
          </Button>
        </div>

        {zapiQr.data?.image && !zapiStatus.data?.connected && (
          <div className="pt-2 flex flex-col items-center gap-2">
            <img
              src={zapiQr.data.image}
              alt="QR Code WhatsApp"
              className="w-44 h-44 rounded-xl border border-slate-200 p-2 bg-white"
            />
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <QrCode className="h-3.5 w-3.5" /> Escaneie no WhatsApp → Aparelhos conectados
            </span>
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
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: AdminClientRow | null;
  plans: AdminPlanRow[];
  servers: AdminServerRow[];
  defaultDue: string;
  onSaved: () => void;
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
    }
  }, [open, editing, defaultDue]);

  const save = useMutation({
    mutationFn: () =>
      adminPost(editing ? "update_client" : "create_client", {
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
      }),
    onSuccess: () => {
      toast.success(editing ? "Cliente atualizado!" : "Cliente cadastrado!");
      onOpenChange(false);
      onSaved();
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
          {/* Dados Básicos */}
          <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100 space-y-3">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Dados do Assinante
            </p>
            <div>
              <Label className={PORTAL_LABEL_CLASS}>Nome completo *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do assinante"
                className={PORTAL_INPUT_CLASS}
              />
            </div>
            <div>
              <Label className={PORTAL_LABEL_CLASS}>WhatsApp *</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="11999999999"
                inputMode="tel"
                className={PORTAL_INPUT_CLASS}
              />
            </div>
          </div>

          {/* Plano, Servidor e IPTV */}
          <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100 space-y-3">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Plano, Servidor e IPTV
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <Label className={PORTAL_LABEL_CLASS}>Plano</Label>
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

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <Label className={PORTAL_LABEL_CLASS}>Login IPTV</Label>
                <Input
                  value={iptvLogin}
                  onChange={(e) => setIptvLogin(e.target.value)}
                  placeholder="Usuário"
                  className={PORTAL_INPUT_CLASS}
                />
              </div>
              <div>
                <Label className={PORTAL_LABEL_CLASS}>Senha IPTV</Label>
                <Input
                  value={iptvPassword}
                  onChange={(e) => setIptvPassword(e.target.value)}
                  placeholder="Senha"
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
                <Label className={PORTAL_LABEL_CLASS}>Vencimento</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={PORTAL_INPUT_CLASS}
                />
              </div>
            </div>
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
            {save.isPending ? "Salvando..." : editing ? "Salvar Alterações" : "Cadastrar Cliente"}
          </Button>
        </DialogFooter>
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
