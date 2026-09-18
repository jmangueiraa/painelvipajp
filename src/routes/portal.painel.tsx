import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Calendar,
  CreditCard,
  Gift,
  RefreshCw,
  Server as ServerIcon,
  Tv,
  Download,
  Copy,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Smartphone,
  ExternalLink,
  Loader2,
  ShoppingBag,
  BrainCircuit,
  AlertTriangle,
  QrCode,
  ArrowLeft,
  Info,
  Sparkles,
  Film,
  HelpCircle,
  Eye,
  EyeOff,
  Headphones,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { brl, formatDateBR } from "@/lib/format";
import { clearPortalToken, getPortalToken, portalFetch, PortalFetchError } from "@/lib/portal-client";
import { PortalShell, type PortalTab } from "@/components/portal/portal-shell";
import { InstallAppCard } from "@/components/portal/install-app-card";
import { PushNotificationCard } from "@/components/portal/push-notification-card";
import { ModernCardCheckout, type CardFormData } from "@/components/modern-card-checkout";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/portal/painel")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Painel do Cliente — AJP VIP" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#FF5500" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Portal VIP" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "manifest", href: "/portal-manifest.webmanifest?v=6" },
      { rel: "apple-touch-icon", href: "/portal-icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/portal-icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/portal-icon-512.png" },
    ],
  }),
  component: PortalDashboard,
});

type Me = {
  client: {
    id: string;
    name: string;
    phone: string;
    due_date: string;
    status: string;
    price_cents: number;
    points: number | null;
    iptv_login: string | null;
    iptv_password: string | null;
    referral_code: string | null;
    bonus_days: number;
  };
  plan: { id: string; name: string; price_cents: number; duration_days: number } | null;
  server: { id: string; name: string } | null;
  payments: { id: string; amount_cents: number; paid_at: string; method: string | null }[];
  referrals: { id: string; name: string; paid: boolean }[];
  settings: {
    referral_reward_days: number;
    referral_enabled: boolean;
    app_android_url: string | null;
    app_ios_url: string | null;
    updates_movies_text: string | null;
    updates_series_text: string | null;
    updates_movies_updated_at: string | null;
    updates_series_updated_at: string | null;
    updates_games_text: string | null;
    updates_games_updated_at: string | null;
  };
  plans: { id: string; name: string; price_cents: number; duration_days: number }[];
  updates: { id: string; kind: "movie" | "series"; title: string; description: string | null; image_url: string | null; created_at: string }[];
};

function parseUpdatesText(text: string | null | undefined): { category: string; items: string[] }[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const groups: { category: string; items: string[] }[] = [];
  let current: { category: string; items: string[] } | null = null;
  const catRe = /^\*?\s*[\(\[]([^)\]]+)[\)\]]\s*\*?\s*:?\s*$/;
  const itemRe = /^\s*(?:\d+\s*[-–.)]|[-–•*])\s*(.+)$/;
  const ensureCurrent = () => {
    if (!current) {
      current = { category: "Novidades", items: [] };
      groups.push(current);
    }
    return current;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = catRe.exec(line);
    if (m) {
      current = { category: m[1].trim(), items: [] };
      groups.push(current);
      continue;
    }
    const it = itemRe.exec(line);
    if (it) {
      ensureCurrent().items.push(it[1].trim());
    } else {
      ensureCurrent().items.push(line);
    }
  }
  return groups.filter((g) => g.items.length > 0);
}

type StoreItem = {
  id: string;
  label: string;
  price_cents: number;
  emoji: string;
  gradient: string;
  image_url?: string | null;
};

const fallbackProducts: StoreItem[] = [
  { id: "chatgpt", label: "ChatGPT Plus - 30 dias", price_cents: 3000, emoji: "🤖", gradient: "from-emerald-500 to-teal-600" },
  { id: "spotify", label: "Spotify Premium - 30 dias", price_cents: 1500, emoji: "🎵", gradient: "from-green-500 to-emerald-600" },
  { id: "youtube", label: "YouTube Premium - 30 dias", price_cents: 1500, emoji: "▶️", gradient: "from-red-500 to-rose-600" },
  { id: "smatone", label: "Smatone - 1 ano", price_cents: 2000, emoji: "🔑", gradient: "from-indigo-500 to-purple-600" },
  { id: "globoplay", label: "Globo Play - 30 dias", price_cents: 1500, emoji: "📺", gradient: "from-blue-500 to-sky-600" },
  { id: "primevideo", label: "Prime Video - 30 dias", price_cents: 1500, emoji: "🎬", gradient: "from-sky-500 to-blue-700" },
  { id: "netflix", label: "Netflix 1 tela - 30 dias", price_cents: 1500, emoji: "🎞️", gradient: "from-red-600 to-black" },
];

function PortalDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<PortalTab>("inicio");

  // Invoice & Renewal Modal state
  const [renewOpen, setRenewOpen] = useState(false);
  const [showCreds, setShowCreds] = useState(false);
  const [showCredsPassword, setShowCredsPassword] = useState(false);
  const [showPeriodChange, setShowPeriodChange] = useState(true);
  const [chosenPeriod, setChosenPeriod] = useState<{ label: string; days: number; price_cents: number } | null>(null);
  const [method, setMethod] = useState<"pix" | "card" | null>(null);
  const [pixPeriod, setPixPeriod] = useState<{ label: string; days: number; price_cents: number } | null>(null);
  const [valCopied, setValCopied] = useState(false);
  const [brCopied, setBrCopied] = useState(false);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [pixPayload, setPixPayload] = useState<string>("");
  const [renewalId, setRenewalId] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string>("pending");
  const [creating, setCreating] = useState(false);
  const [cardLink, setCardLink] = useState<string | null>(null);

  // Faturas Tab State
  const [paidOpen, setPaidOpen] = useState(true);
  const [payPage, setPayPage] = useState(1);
  const pollRef = useRef<number | null>(null);

  // Updates & AI Agent & Store
  const [updatesKind, setUpdatesKind] = useState<"movie" | "series" | "games" | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportInput, setSupportInput] = useState("");
  const [supportHistory, setSupportHistory] = useState<any[]>([]);
  const [supportSession, setSupportSession] = useState("");

  const [storeOpen, setStoreOpen] = useState(false);
  const [storeItem, setStoreItem] = useState<StoreItem | null>(null);
  const [storeMethod, setStoreMethod] = useState<"pix" | "card" | null>(null);
  const [storeQrBase64, setStoreQrBase64] = useState<string | null>(null);
  const [storePixPayload, setStorePixPayload] = useState<string>("");
  const [storeCardLink, setStoreCardLink] = useState<string | null>(null);
  const [storeCreating, setStoreCreating] = useState(false);

  useEffect(() => {
    setSupportSession(`portal-session-${Math.random().toString(36).slice(2)}`);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const u = params.get("updates");
    if (u === "movie" || u === "series" || u === "games") {
      setUpdatesKind(u);
      setActiveTab("mais");
      params.delete("updates");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  const { data: remoteProducts } = useQuery({
    queryKey: ["portal-store-products"],
    queryFn: async () => {
      try {
        const j = await portalFetch<{ products: StoreItem[] }>("/api/public/portal/store-products");
        return j.products ?? fallbackProducts;
      } catch {
        return fallbackProducts;
      }
    },
    initialData: fallbackProducts,
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });
  const storeProducts: StoreItem[] = remoteProducts && remoteProducts.length > 0 ? remoteProducts : fallbackProducts;

  useEffect(() => {
    if (!getPortalToken()) navigate({ to: "/portal" });
  }, [navigate]);

  useEffect(() => {
    if (!getPortalToken()) return;
    const t = window.setTimeout(() => {
      import("@/lib/fcm").then((m) => m.initPortalPush({ silent: true })).catch(() => {});
    }, 5000);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!getPortalToken()) return;
    const t = window.setTimeout(() => {
      const standalone =
        window.matchMedia?.("(display-mode: standalone)").matches ||
        window.matchMedia?.("(display-mode: fullscreen)").matches ||
        window.matchMedia?.("(display-mode: minimal-ui)").matches ||
        // @ts-expect-error iOS specific
        window.navigator.standalone === true;
      if (!standalone) return;
      portalFetch("/api/public/portal/register-install", {
        method: "POST",
        body: JSON.stringify({ platform: navigator.userAgent }),
      }).catch(() => {});
    }, 4000);
    return () => window.clearTimeout(t);
  }, []);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["portal", "me"],
    queryFn: async () => {
      const token = getPortalToken();
      // 1. Chamada DIRETA ao Supabase RPC (resposta instantânea em ~30ms, sem proxy)
      if (token) {
        try {
          const { data: rpcData, error: rpcErr } = await supabase.rpc("portal_get_session", { _token: token });
          if (!rpcErr && rpcData && typeof rpcData === "object" && (rpcData as any).client) {
            try {
              localStorage.setItem("portal_cached_me", JSON.stringify(rpcData));
            } catch {}
            return rpcData as unknown as Me;
          }
        } catch (supaErr) {
          console.warn("[portal direct get_session fallback]", supaErr);
        }
      }

      // 2. Fallback via rota de API do servidor
      const res = await portalFetch<Me>("/api/public/portal/me");
      try {
        localStorage.setItem("portal_cached_me", JSON.stringify(res));
      } catch {}
      return res;
    },
    initialData: () => {
      if (typeof window === "undefined") return undefined;
      try {
        const cached = localStorage.getItem("portal_cached_me");
        if (cached) return JSON.parse(cached) as Me;
      } catch {}
      return undefined;
    },
    staleTime: 1000 * 60 * 3, // 3 min de cache ativo (troca de aba instantânea)
    refetchOnWindowFocus: false, // Evita travamentos ao trocar de aba no celular
    retry: false,
  });

  useEffect(() => {
    if (error) {
      const is401 =
        (error instanceof PortalFetchError && error.status === 401) ||
        error.message?.includes("401") ||
        error.message?.includes("Sessão inválida") ||
        error.message?.includes("Unauthorized");
      if (is401) {
        clearPortalToken();
        navigate({ to: "/portal" });
      }
    }
  }, [error, navigate]);

  // Polling payment status
  useEffect(() => {
    if (!renewalId) return;
    if (paymentStatus === "approved" || paymentStatus === "rejected" || paymentStatus === "cancelled") return;
    pollRef.current = window.setInterval(async () => {
      try {
        const r = await portalFetch<{ status: string }>(`/api/public/portal/renewal-status?id=${renewalId}`);
        if (r.status && r.status !== paymentStatus) {
          setPaymentStatus(r.status);
          if (r.status === "approved") {
            toast.success("Pagamento confirmado com sucesso!");
            void refetch();
            if (pollRef.current) window.clearInterval(pollRef.current);
            setTimeout(() => {
              setRenewOpen(false);
              setPixPeriod(null);
              setQrBase64(null);
              setPixPayload("");
              setRenewalId(null);
              setPaymentId(null);
              setPaymentStatus("pending");
              setStoreOpen(false);
              setStoreItem(null);
              setStoreMethod(null);
              setStoreQrBase64(null);
              setStorePixPayload("");
              setStoreCardLink(null);
            }, 3500);
          } else if (r.status === "rejected" || r.status === "cancelled") {
            toast.error("Pagamento não aprovado. Gere um novo PIX.");
            if (pollRef.current) window.clearInterval(pollRef.current);
          }
        }
      } catch {
        /* noop */
      }
    }, 5000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [renewalId, paymentStatus, refetch]);

  const renew = useMutation({
    mutationFn: (o: { days: number; amount_cents: number; label: string }) =>
      portalFetch<{ renewal_id: string; payment_id: string; qr_code: string; qr_code_base64: string }>(
        "/api/public/portal/mp-create-pix",
        { method: "POST", body: JSON.stringify({ ...o, token: getPortalToken() }) },
      ),
    onSuccess: (r) => {
      setRenewalId(r.renewal_id);
      setPaymentId(r.payment_id);
      setPixPayload(r.qr_code);
      setQrBase64(r.qr_code_base64);
      setPaymentStatus("pending");
      toast.success("QR Code PIX gerado com sucesso!");
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setPixPeriod(null);
      setMethod(null);
    },
    onSettled: () => setCreating(false),
  });

  const renewCard = useMutation({
    mutationFn: (o: { days: number; amount_cents: number; label: string }) =>
      portalFetch<{ renewal_id: string; init_point: string; amount_cents: number; base_cents: number }>(
        "/api/public/portal/mp-create-card",
        { method: "POST", body: JSON.stringify({ ...o, token: getPortalToken() }) },
      ),
    onSuccess: (r) => {
      setRenewalId(r.renewal_id);
      setPaymentStatus("pending");
      setCardLink(r.init_point);
      window.location.assign(r.init_point);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setMethod(null);
    },
    onSettled: () => setCreating(false),
  });

  const buyExtra = useMutation({
    mutationFn: (o: { method: "pix" | "card"; product_key: string; label: string; amount_cents: number }) =>
      portalFetch<{ renewal_id: string; payment_id?: string; qr_code?: string; qr_code_base64?: string; init_point?: string }>(
        "/api/public/portal/mp-create-extra",
        { method: "POST", body: JSON.stringify(o) },
      ),
    onSuccess: (r, vars) => {
      setRenewalId(r.renewal_id);
      setPaymentStatus("pending");
      if (vars.method === "pix") {
        setStorePixPayload(r.qr_code ?? "");
        setStoreQrBase64(r.qr_code_base64 ?? null);
        toast.success("QR Code PIX gerado!");
      } else if (r.init_point) {
        setStoreCardLink(r.init_point);
        window.location.assign(r.init_point);
      }
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setStoreMethod(null);
    },
    onSettled: () => setStoreCreating(false),
  });

  function openInvoiceModal() {
    if (!data) return;
    const defaultPrice = data.client.price_cents > 0 ? data.client.price_cents : data.plan?.price_cents || 3000;
    const defaultDays = data.plan?.duration_days || 30;
    setChosenPeriod({
      label: data.plan?.name ?? "Mensal",
      days: defaultDays,
      price_cents: defaultPrice,
    });
    setMethod(null);
    setPixPeriod(null);
    setQrBase64(null);
    setPixPayload("");
    setCardLink(null);
    setShowCreds(false);
    setShowPeriodChange(true);
    setRenewOpen(true);
  }

  function openStoreItem(p: StoreItem) {
    setStoreItem(p);
    setStoreMethod(null);
    setStoreQrBase64(null);
    setStorePixPayload("");
    setStoreCardLink(null);
    setStoreOpen(true);
  }

  function chooseStoreMethod(m: "pix" | "card") {
    if (!storeItem) return;
    setStoreMethod(m);
    if (m === "pix") {
      setStoreCreating(true);
      buyExtra.mutate({ method: "pix", product_key: storeItem.id, label: storeItem.label, amount_cents: storeItem.price_cents });
    }
  }

  function choosePix() {
    if (!chosenPeriod) return;
    setMethod("pix");
    setPixPeriod(chosenPeriod);
    setCreating(true);
    renew.mutate({ days: chosenPeriod.days, amount_cents: chosenPeriod.price_cents, label: chosenPeriod.label });
  }

  function chooseCard() {
    if (!chosenPeriod) return;
    setMethod("card");
    setCreating(false);
  }

  async function handleCardSubmit(cardData: CardFormData) {
    if (!chosenPeriod) return { ok: false, error: "Nenhum plano selecionado" };
    try {
      const res = await portalFetch<{
        ok: boolean;
        status: string;
        renewal_id?: string;
        payment_id?: string | number;
        message?: string;
        error?: string;
        detail?: string;
      }>("/api/public/portal/mp-create-card", {
        method: "POST",
        body: JSON.stringify({
          days: chosenPeriod.days,
          amount_cents: chosenPeriod.price_cents,
          label: chosenPeriod.label,
          token: getPortalToken(),
          card_data: cardData,
        }),
      });

      if (res.ok && res.status === "approved") {
        setPaymentStatus("approved");
        toast.success("Pagamento confirmado com sucesso!");
        void refetch();
        return { ok: true, message: res.message };
      } else if (res.ok && res.status === "in_process") {
        if (res.renewal_id) setRenewalId(res.renewal_id);
        setPaymentStatus("in_process");
        toast.info("Pagamento em análise pelo Mercado Pago.");
        return { ok: true, message: res.message };
      } else {
        return { ok: false, message: res.error || res.message || "Pagamento recusado" };
      }
    } catch (err) {
      return { ok: false, message: (err as Error).message || "Falha ao se comunicar com o Mercado Pago" };
    }
  }

  async function handleStoreCardSubmit(cardData: CardFormData) {
    if (!storeItem) return { ok: false, error: "Produto não encontrado" };
    try {
      const res = await portalFetch<{
        ok: boolean;
        status: string;
        renewal_id?: string;
        payment_id?: string | number;
        message?: string;
        error?: string;
        detail?: string;
      }>("/api/public/portal/mp-create-extra", {
        method: "POST",
        body: JSON.stringify({
          method: "card",
          product_key: storeItem.id,
          label: storeItem.label,
          amount_cents: storeItem.price_cents,
          card_data: cardData,
        }),
      });

      if (res.ok && res.status === "approved") {
        setPaymentStatus("approved");
        toast.success("Compra confirmada com sucesso!");
        void refetch();
        return { ok: true, message: res.message };
      } else if (res.ok && res.status === "in_process") {
        if (res.renewal_id) setRenewalId(res.renewal_id);
        setPaymentStatus("in_process");
        toast.info("Pagamento em análise pelo Mercado Pago.");
        return { ok: true, message: res.message };
      } else {
        return { ok: false, message: res.error || res.message || "Pagamento recusado" };
      }
    } catch (err) {
      return { ok: false, message: (err as Error).message || "Falha ao se comunicar com o Mercado Pago" };
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setValCopied(true);
      setTimeout(() => setValCopied(false), 2000);
      toast.success("Copiado para a área de transferência!");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  function handleLogout() {
    void portalFetch("/api/public/portal/logout", { method: "POST" }).catch(() => undefined);
    clearPortalToken();
    navigate({ to: "/portal" });
  }

  function downloadReceipt(p: { id: string; amount_cents: number; paid_at: string; method: string | null }) {
    if (!data) return;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Comprovante ${p.id.slice(0, 8)}</title>
      <style>body{font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:40px auto;padding:24px;color:#0f172a}
      h1{margin:0 0 4px 0;font-size:20px} .muted{color:#64748b;font-size:13px}
      .row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px dashed #cbd5e1}
      .total{font-size:22px;font-weight:700;margin-top:18px}
      .stamp{margin-top:32px;padding:14px;border:2px solid #10b981;color:#059669;text-align:center;border-radius:12px;font-weight:700;letter-spacing:1px}
      </style></head><body>
      <h1>Comprovante de Pagamento</h1>
      <div class="muted">Recibo nº ${p.id.slice(0, 8).toUpperCase()}</div>
      <div style="margin-top:24px">
        <div class="row"><span>Cliente</span><strong>${data.client.name}</strong></div>
        <div class="row"><span>WhatsApp</span><span>${data.client.phone}</span></div>
        <div class="row"><span>Plano</span><span>${data.plan?.name ?? "Assinatura VIP"}</span></div>
        <div class="row"><span>Forma de Pagamento</span><span>${p.method ?? "PIX"}</span></div>
        <div class="row"><span>Data de Confirmação</span><span>${formatDateBR(p.paid_at)}</span></div>
        <div class="row total"><span>Valor Pago</span><span>${brl(p.amount_cents)}</span></div>
      </div>
      <div class="stamp">PAGAMENTO CONFIRMADO</div>
      <script>window.print()</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return toast.error("Permita pop-ups para visualizar o comprovante");
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  if (error) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-[#F4F5F7] px-4 py-8 text-slate-800 font-sans">
        <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl text-center space-y-4 border border-slate-100 animate-in fade-in duration-200">
          <div className="w-14 h-14 rounded-2xl bg-orange-100 text-[#FF5500] flex items-center justify-center mx-auto shadow-sm">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Não foi possível carregar seu painel</h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              {(error as Error).message || "Falha na conexão com o servidor. Verifique sua rede e tente novamente."}
            </p>
          </div>
          <div className="space-y-2 pt-2">
            <Button
              className="w-full bg-[#FF5500] hover:bg-[#E04B00] text-white font-bold rounded-xl py-3 cursor-pointer shadow-sm"
              onClick={() => refetch()}
            >
              Tentar novamente
            </Button>
            <Button
              variant="outline"
              className="w-full rounded-xl text-xs py-2.5 cursor-pointer border-slate-200 text-slate-600 hover:bg-slate-50"
              onClick={handleLogout}
            >
              Voltar ao login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-[#F4F5F7] text-slate-500 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF5500]" />
        <span className="text-sm font-semibold">Carregando painel do assinante...</span>
      </div>
    );
  }

  const dueDays = Math.ceil((new Date(data.client.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const overdue = dueDays < 0;
  const isSuspended = data.client.status === "suspenso" || data.client.status === "cancelado";
  const displayStatus = isSuspended ? data.client.status : overdue ? "vencido" : "ativo";

  // Formata mês de vencimento para o cabeçalho dos detalhes
  const dueDateObj = new Date(data.client.due_date);
  const dueMonthName = !isNaN(dueDateObj.getTime())
    ? dueDateObj.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    : "";
  const formattedMonthTitle = dueMonthName ? dueMonthName.charAt(0).toUpperCase() + dueMonthName.slice(1) : "Atual";

  return (
    <PortalShell
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onLogout={handleLogout}
      clientName={data.client.name}
    >
      {/* ========================================================================= */}
      {/* ABA 1: INÍCIO (Referência Imagem 2)                                      */}
      {/* ========================================================================= */}
      {activeTab === "inicio" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Card de Contrato do Topo */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                CONTRATO · #{data.client.id.slice(0, 8).toUpperCase()}
              </span>
              <span className="text-sm sm:text-base font-extrabold text-slate-800 leading-snug">
                {data.plan?.name ?? "Plano Mensal VIP"}
              </span>
              {data.server && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                  <ServerIcon className="h-3 w-3 text-slate-400" />
                  <span>{data.server.name}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col items-end">
              <span
                className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                  displayStatus === "ativo"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}
              >
                {displayStatus === "ativo" ? "Ativo" : displayStatus === "vencido" ? "A vencer" : displayStatus}
              </span>
            </div>
          </div>

          {/* Saudação ao Cliente */}
          <div className="px-1 pt-1">
            <p className="text-xs sm:text-sm text-slate-500 font-medium">Seja bem-vindo(a),</p>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight">
              {data.client.name}
            </h1>
          </div>

          {/* Bloco "Priorizar Pagamento" (Idêntico ao card da Imagem 2) */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <AlertTriangle className="h-4 w-4 text-amber-500 fill-amber-500/20" />
              <span className="text-xs sm:text-sm font-bold text-slate-800">
                Priorizar pagamento:
              </span>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
              <div className="flex items-center justify-between">
                <span className="bg-amber-100 text-amber-900 text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                  {overdue ? "Vencido" : "A vencer"}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  {overdue ? `Vencido há ${Math.abs(dueDays)} dias` : `Faltam ${dueDays} dias`}
                </span>
              </div>

              <div>
                <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  {brl(data.client.price_cents > 0 ? data.client.price_cents : data.plan?.price_cents || 3000)}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>Vencimento em {formatDateBR(data.client.due_date)}</span>
                </div>
              </div>

              {/* Botão Pagar Agora (Grande, Laranja, com Ícone) */}
              <button
                type="button"
                onClick={openInvoiceModal}
                className="w-full bg-[#FF5500] hover:bg-[#E04B00] active:scale-[0.99] text-white font-extrabold py-3.5 px-4 rounded-xl shadow-md shadow-orange-500/20 flex items-center justify-center gap-2 text-sm sm:text-base transition-all cursor-pointer"
              >
                <QrCode className="h-5 w-5" />
                <span>Pagar agora</span>
              </button>
            </div>
          </div>

          {/* Seção "Acesso Rápido" (Botões Circulares da Imagem 2) */}
          <div className="space-y-2 pt-2">
            <h2 className="text-sm font-bold text-slate-800 px-1">Acesso rápido</h2>
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              {/* 1. Pagamento / Renovação */}
              <button
                type="button"
                onClick={openInvoiceModal}
                className="flex flex-col items-center gap-1.5 p-2 rounded-2xl bg-white border border-slate-100 hover:border-orange-300 shadow-sm transition-all hover:shadow cursor-pointer active:scale-95"
              >
                <div className="w-12 h-12 rounded-2xl bg-orange-50 text-[#FF5500] flex items-center justify-center">
                  <RefreshCw className="h-5 w-5" />
                </div>
                <span className="text-[10px] sm:text-xs font-semibold text-slate-700 text-center leading-tight">
                  Pagar fatura
                </span>
              </button>

              {/* 2. Suporte WhatsApp */}
              <a
                href="https://wa.me/5519981356505?text=Olá,%20preciso%20de%20suporte%20no%20meu%20plano"
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center gap-1.5 p-2 rounded-2xl bg-white border border-slate-100 hover:border-emerald-300 shadow-sm transition-all hover:shadow cursor-pointer active:scale-95"
              >
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Headphones className="h-5 w-5" />
                </div>
                <span className="text-[10px] sm:text-xs font-semibold text-slate-700 text-center leading-tight">
                  Suporte Whats
                </span>
              </a>

              {/* 3. Especialista IA */}
              <button
                type="button"
                onClick={() => setSupportOpen(true)}
                className="flex flex-col items-center gap-1.5 p-2 rounded-2xl bg-white border border-slate-100 hover:border-indigo-300 shadow-sm transition-all hover:shadow cursor-pointer active:scale-95"
              >
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <BrainCircuit className="h-5 w-5" />
                </div>
                <span className="text-[10px] sm:text-xs font-semibold text-slate-700 text-center leading-tight">
                  Guia TV (IA)
                </span>
              </button>

              {/* 4. Indique e Ganhe */}
              <Link
                to="/portal/indique"
                className="flex flex-col items-center gap-1.5 p-2 rounded-2xl bg-white border border-slate-100 hover:border-amber-300 shadow-sm transition-all hover:shadow cursor-pointer active:scale-95"
              >
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Gift className="h-5 w-5" />
                </div>
                <span className="text-[10px] sm:text-xs font-semibold text-slate-700 text-center leading-tight">
                  Indique
                </span>
              </Link>
            </div>
          </div>

          {/* Banner de Atendimento e Informações */}
          <div className="bg-gradient-to-r from-orange-500/10 via-orange-500/5 to-transparent rounded-2xl p-4 border border-orange-200/60 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FF5500] text-white flex items-center justify-center shrink-0 shadow-sm">
                <Headphones className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-900">Atendimento ao Cliente</span>
                <span className="text-[11px] text-slate-500">Suporte humanizado todos os dias</span>
              </div>
            </div>

            <a
              href="https://wa.me/5519981356505?text=Olá,%20gostaria%20de%20falar%20com%20o%20atendimento"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-[#FF5500] text-xs font-bold shadow-sm border border-orange-200 transition cursor-pointer shrink-0"
            >
              Falar agora
            </a>
          </div>

          {/* Visualização de Dados de Acesso IPTV (Discreta e Segura) */}
          {(data.client.iptv_login || data.client.iptv_password) && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-[#FF5500]" /> Dados de Conexão IPTV
                </span>
                <button
                  type="button"
                  onClick={() => setShowCreds(!showCreds)}
                  className="text-xs text-[#FF5500] font-semibold hover:underline cursor-pointer"
                >
                  {showCreds ? "Ocultar dados" : "Ver credenciais"}
                </button>
              </div>

              {showCreds && (
                <div className="pt-2 border-t border-slate-100 space-y-2 animate-in fade-in duration-200">
                  {data.client.iptv_login && (
                    <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Usuário IPTV:</span>
                        <span className="font-mono font-bold text-slate-800">{data.client.iptv_login}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copy(data.client.iptv_login!)}
                        className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition cursor-pointer"
                        title="Copiar usuário"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {data.client.iptv_password && (
                    <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Senha IPTV:</span>
                        <span className="font-mono font-bold text-slate-800">
                          {showCredsPassword ? data.client.iptv_password : "••••••••"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setShowCredsPassword(!showCredsPassword)}
                          className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition cursor-pointer"
                          title="Mostrar/Ocultar"
                        >
                          {showCredsPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => copy(data.client.iptv_password!)}
                          className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition cursor-pointer"
                          title="Copiar senha"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: FATURAS (Referência Imagem 5)                                     */}
      {/* ========================================================================= */}
      {activeTab === "faturas" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Card de Contrato do Topo */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                CONTRATO · #{data.client.id.slice(0, 8).toUpperCase()}
              </span>
              <span className="text-sm sm:text-base font-extrabold text-slate-800">
                {data.plan?.name ?? "Plano Mensal VIP"}
              </span>
            </div>
            <span
              className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                displayStatus === "ativo"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-amber-50 text-amber-700 border border-amber-200"
              }`}
            >
              {displayStatus === "ativo" ? "Ativo" : displayStatus === "vencido" ? "A vencer" : displayStatus}
            </span>
          </div>

          <div className="px-1">
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Minhas faturas</h1>
          </div>

          {/* Seção "EM ABERTO" (Imagem 5) */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
              Em aberto
            </span>

            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>Vencimento em {formatDateBR(data.client.due_date)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black text-slate-900">
                    {brl(data.client.price_cents > 0 ? data.client.price_cents : data.plan?.price_cents || 3000)}
                  </span>
                  <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                    {overdue ? "Vencido" : "A vencer"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={openInvoiceModal}
                className="bg-[#FF5500] hover:bg-[#E04B00] active:scale-95 text-white font-bold text-xs sm:text-sm px-5 py-2.5 rounded-xl shadow-sm transition cursor-pointer"
              >
                Pagar
              </button>
            </div>
          </div>

          {/* Seção "PAGAS" (Lista Sanfonada com Checkmark Verde da Imagem 5) */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={() => setPaidOpen(!paidOpen)}
              className="w-full flex items-center justify-between px-1 text-slate-700 font-bold text-sm cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span>Pagas</span>
                <span className="text-xs font-semibold text-slate-400">({data.payments.length})</span>
              </div>
              {paidOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
            </button>

            {paidOpen && (
              <div className="space-y-2.5 animate-in fade-in duration-200">
                {data.payments.length === 0 ? (
                  <div className="bg-white rounded-2xl p-6 text-center text-xs text-slate-400 shadow-sm border border-slate-100">
                    Nenhum pagamento registrado até o momento.
                  </div>
                ) : (
                  (() => {
                    const pageSize = 10;
                    const totalPages = Math.max(1, Math.ceil(data.payments.length / pageSize));
                    const page = Math.min(payPage, totalPages);
                    const start = (page - 1) * pageSize;
                    const slice = data.payments.slice(start, start + pageSize);
                    return (
                      <>
                        {slice.map((p) => (
                          <div
                            key={p.id}
                            className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-3.5 transition hover:border-slate-300"
                          >
                            {/* Ícone de Verificado Verde da Imagem 5 */}
                            <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0 border border-emerald-200">
                              <CheckCircle2 className="h-5 w-5 text-emerald-500" strokeWidth={2.5} />
                            </div>

                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">Vencimento</span>
                              <span className="text-sm font-bold text-slate-800 truncate block">
                                {formatDateBR(p.paid_at)}
                              </span>
                            </div>

                            <div className="text-right">
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">Original</span>
                              <span className="text-sm font-black text-slate-800 block">
                                {brl(p.amount_cents)}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => downloadReceipt(p)}
                              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer shrink-0"
                              title="Baixar comprovante de pagamento"
                              aria-label="Baixar recibo"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                          </div>
                        ))}

                        {totalPages > 1 && (
                          <div className="flex items-center justify-between px-2 pt-2 text-xs text-slate-500">
                            <span>Página {page} de {totalPages}</span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setPayPage((p) => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="px-3 py-1 bg-white border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
                              >
                                Anterior
                              </button>
                              <button
                                type="button"
                                onClick={() => setPayPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="px-3 py-1 bg-white border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
                              >
                                Próxima
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 3: MAIS (Recursos Extras do Painel VIP)                              */}
      {/* ========================================================================= */}
      {activeTab === "mais" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="px-1">
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Mais opções</h1>
            <p className="text-xs text-slate-500">Serviços adicionais, suporte e ferramentas</p>
          </div>

          {/* Cards de Recursos */}
          <div className="space-y-3">
            {/* Suporte WhatsApp Direto */}
            <a
              href="https://wa.me/5519981356505?text=Olá,%20gostaria%20de%20atendimento%20no%20meu%20plano"
              target="_blank"
              rel="noreferrer"
              className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between cursor-pointer hover:border-emerald-400 transition-all active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                  <Headphones className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">Atendimento WhatsApp</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                      Online
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    (19) 98135-6505 · Fale com nossa equipe agora
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-300" />
            </a>

            {/* 1. Suporte Inteligente IA */}
            <div
              onClick={() => setSupportOpen(true)}
              className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between cursor-pointer hover:border-indigo-300 transition-all active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <BrainCircuit className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">Especialista em Instalação</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                      IA 24h
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Instale na sua Smart TV, TV Box, celular ou computador
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-300" />
            </div>

            {/* 2. Loja de Produtos Extras */}
            <div
              onClick={() => setStoreOpen(true)}
              className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between cursor-pointer hover:border-orange-300 transition-all active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-orange-50 text-[#FF5500] flex items-center justify-center shrink-0">
                  <ShoppingBag className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">Loja de Assinaturas &amp; Apps</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-orange-100 text-[#FF5500] px-2 py-0.5 rounded-full">
                      Novidades
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    ChatGPT, Spotify, YouTube Premium e telas adicionais
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-300" />
            </div>

            {/* 3. Novidades e Catálogo */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
              <div className="flex items-center gap-2">
                <Film className="h-4 w-4 text-[#FF5500]" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Atualizações de Conteúdo
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setUpdatesKind("movie")}
                  className="p-3 rounded-xl bg-slate-50 hover:bg-orange-50/50 hover:border-orange-200 border border-slate-100 text-center transition cursor-pointer"
                >
                  <span className="block text-base mb-0.5">🎬</span>
                  <span className="block text-xs font-bold text-slate-800">Filmes</span>
                  <span className="block text-[10px] text-slate-500">Recentes</span>
                </button>

                <button
                  type="button"
                  onClick={() => setUpdatesKind("series")}
                  className="p-3 rounded-xl bg-slate-50 hover:bg-orange-50/50 hover:border-orange-200 border border-slate-100 text-center transition cursor-pointer"
                >
                  <span className="block text-base mb-0.5">📺</span>
                  <span className="block text-xs font-bold text-slate-800">Séries</span>
                  <span className="block text-[10px] text-slate-500">Temporadas</span>
                </button>

                <button
                  type="button"
                  onClick={() => setUpdatesKind("games")}
                  className="p-3 rounded-xl bg-slate-50 hover:bg-orange-50/50 hover:border-orange-200 border border-slate-100 text-center transition cursor-pointer"
                >
                  <span className="block text-base mb-0.5">⚽</span>
                  <span className="block text-xs font-bold text-slate-800">Jogos</span>
                  <span className="block text-[10px] text-slate-500">Transmissões</span>
                </button>
              </div>
            </div>

            {/* 4. Indique e Ganhe */}
            {data.settings.referral_enabled && data.client.referral_code && (
              <Link
                to="/portal/indique"
                className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between cursor-pointer hover:border-emerald-300 transition-all active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <Gift className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-800 block">
                      Indique e Ganhe {data.settings.referral_reward_days} dias grátis
                    </span>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {data.referrals.length} indicados · {data.client.bonus_days} dias acumulados
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-300" />
              </Link>
            )}

            {/* 5. Instalação e Notificações */}
            <InstallAppCard />
            <PushNotificationCard />

            {/* 6. Botão de Logout */}
            <button
              type="button"
              onClick={handleLogout}
              className="w-full bg-white hover:bg-rose-50 text-rose-600 border border-rose-100 font-bold py-3.5 px-4 rounded-2xl shadow-sm transition text-xs sm:text-sm cursor-pointer mt-2"
            >
              Sair da minha conta
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DETALHES DA FATURA E PAGAMENTO PIX (Imagens 1 e 4)                */}
      {/* ========================================================================= */}
      <Dialog
        open={renewOpen}
        onOpenChange={(o) => {
          setRenewOpen(o);
          if (!o) {
            setChosenPeriod(null);
            setMethod(null);
            setPixPeriod(null);
            setValCopied(false);
            setBrCopied(false);
            setQrBase64(null);
            setPixPayload("");
            setRenewalId(null);
            setPaymentId(null);
            setPaymentStatus("pending");
            setCardLink(null);
            setShowPeriodChange(false);
          }
        }}
      >
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-3xl border-none shadow-2xl bg-[#F4F5F7] [&>button:last-child]:hidden">
          {/* Top Bar Laranja com Título e Botão Fechar (Idêntico à Imagem 1) */}
          <div className="bg-[#FF5500] text-white px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base tracking-tight text-white">
                Detalhes da fatura - {formattedMonthTitle}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setRenewOpen(false)}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold transition cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="p-4 sm:p-5 max-h-[80vh] overflow-y-auto space-y-4">
            {paymentStatus === "approved" ? (
              <div className="flex flex-col items-center gap-4 py-8 text-center bg-white rounded-2xl p-6 shadow-sm">
                <div className="grid h-20 w-20 place-items-center rounded-full bg-emerald-500/15 animate-in zoom-in duration-500">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500" strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-emerald-600">Pagamento confirmado!</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Sua fatura foi quitada e seu plano foi renovado com sucesso.
                  </p>
                </div>
                <Button
                  className="w-full bg-[#FF5500] hover:bg-[#E04B00] text-white font-bold rounded-xl py-3"
                  onClick={() => setRenewOpen(false)}
                >
                  Voltar ao painel
                </Button>
              </div>
            ) : (
              <>
                {/* Resumo da Fatura (Card Branco com Vencimento, Valor e Ver Mais) */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Vencimento:</span>
                    <strong className="text-slate-800">{formatDateBR(data.client.due_date)}</strong>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Valor:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-black text-slate-900">
                        {brl(chosenPeriod?.price_cents ?? data.client.price_cents ?? 3000)}
                      </span>
                      <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                        {overdue ? "Vencido" : "A vencer"}
                      </span>
                    </div>
                  </div>

                  {/* Botão Ver Mais / Ver Menos */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      {data.plan?.name ?? "Plano Mensal"} · {chosenPeriod?.days ?? 30} dias
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPeriodChange(!showPeriodChange)}
                      className="text-[#FF5500] font-bold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      {showPeriodChange ? "Ver menos -" : "Alterar período / Desconto +"}
                    </button>
                  </div>

                  {/* Seletor de Períodos com Desconto (Opcional) */}
                  {showPeriodChange && (
                    <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 animate-in fade-in duration-200">
                      {[
                        { label: "Mensal", months: 1, days: 30, discount: 0 },
                        { label: "Trimestral", months: 3, days: 90, discount: 0.15 },
                        { label: "Semestral", months: 6, days: 180, discount: 0.2 },
                        { label: "Anual", months: 12, days: 365, discount: 0.25 },
                      ].map((p) => {
                        const monthly = data.plan?.price_cents ?? data.client.price_cents ?? 3000;
                        const price = Math.round(monthly * p.months * (1 - p.discount));
                        const isSelected = chosenPeriod?.days === p.days;
                        return (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => {
                              setChosenPeriod({ label: p.label, days: p.days, price_cents: price });
                            }}
                            className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                              isSelected
                                ? "bg-orange-50 border-[#FF5500] text-[#FF5500]"
                                : "bg-slate-50 border-slate-200 text-slate-700 hover:border-orange-300"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs">{p.label}</span>
                              {p.discount > 0 && (
                                <span className="text-[9px] bg-blue-600 text-white font-bold px-1.5 py-0.2 rounded-full">
                                  -{Math.round(p.discount * 100)}%
                                </span>
                              )}
                            </div>
                            <span className="text-xs font-black block mt-0.5">{brl(price)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ========================================================================= */}
                {/* ETAPA 1: ESCOLHA COMO PAGAR (Idêntico à Imagem 1)                          */}
                {/* ========================================================================= */}
                {!method ? (
                  <div className="space-y-2.5">
                    <span className="text-xs font-bold text-slate-800 block px-1">
                      Escolha como pagar:
                    </span>

                    {/* Opção 1: Pix */}
                    <button
                      type="button"
                      onClick={choosePix}
                      className="w-full bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:border-emerald-400 flex items-center justify-between transition cursor-pointer active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                          <QrCode className="h-6 w-6" />
                        </div>
                        <div className="text-left">
                          <span className="text-sm font-bold text-slate-900 block">Pix</span>
                          <span className="text-xs text-slate-500 block">Confirmação imediata</span>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-slate-300" />
                    </button>

                    {/* Opção 2: Cartão de Crédito */}
                    <button
                      type="button"
                      onClick={chooseCard}
                      className="w-full bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:border-orange-400 flex items-center justify-between transition cursor-pointer active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-2xl bg-orange-50 text-[#FF5500] flex items-center justify-center shrink-0 border border-orange-100">
                          <CreditCard className="h-6 w-6" />
                        </div>
                        <div className="text-left">
                          <span className="text-sm font-bold text-slate-900 block">Cartão de crédito</span>
                          <span className="text-xs text-slate-500 block">Até 12x no cartão</span>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-slate-300" />
                    </button>
                  </div>
                ) : method === "pix" ? (
                  /* ========================================================================= */
                  /* ETAPA 2: TELA DE PIX (Idêntico à Imagem 4)                                */
                  /* ========================================================================= */
                  <div className="space-y-4 animate-in fade-in duration-200">
                    {/* Botão de Retornar às Opções de Pagamento */}
                    <button
                      type="button"
                      onClick={() => {
                        setMethod(null);
                        setQrBase64(null);
                        setPixPayload("");
                        setRenewalId(null);
                        setPaymentId(null);
                      }}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-[#FF5500] transition cursor-pointer"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Outras opções de pagamento</span>
                    </button>

                    <p className="text-xs text-slate-600 text-center px-4 leading-relaxed">
                      Escaneie o QR Code com o aplicativo do seu banco ou copie o código clicando no botão.
                    </p>

                    {creating && (
                      <div className="bg-white rounded-2xl p-8 text-center space-y-3 shadow-sm border border-slate-100">
                        <Loader2 className="h-8 w-8 animate-spin text-[#FF5500] mx-auto" />
                        <span className="text-xs font-bold text-slate-600 block">Gerando QR Code PIX oficial...</span>
                      </div>
                    )}

                    {qrBase64 && !creating && (
                      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col items-center justify-center">
                        <img
                          src={`data:image/png;base64,${qrBase64}`}
                          alt="QR Code PIX Oficial"
                          className="w-52 h-52 sm:w-60 sm:h-60 object-contain rounded-xl"
                        />
                        <span className="text-[11px] text-slate-400 mt-2 font-medium">
                          Válido para qualquer aplicativo bancário
                        </span>
                      </div>
                    )}

                    {pixPayload && !creating && (
                      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
                        <span className="text-xs font-bold text-slate-700 block">Copie o código Pix</span>
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] font-mono text-slate-600 break-all max-h-20 overflow-y-auto">
                          {pixPayload}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            void copy(pixPayload);
                            setBrCopied(true);
                            setTimeout(() => setBrCopied(false), 2000);
                          }}
                          className="w-full bg-[#FF5500] hover:bg-[#E04B00] active:scale-[0.99] text-white font-extrabold py-3.5 px-4 rounded-xl shadow-md shadow-orange-500/20 flex items-center justify-center gap-2 text-sm transition cursor-pointer"
                        >
                          {brCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          <span>{brCopied ? "Código copiado!" : "Copiar código Pix"}</span>
                        </button>
                      </div>
                    )}

                    {/* Alerta Azul Informativo (Idêntico ao card azul da Imagem 4) */}
                    <div className="bg-blue-50 border border-blue-200/80 rounded-2xl p-3.5 flex items-start gap-2.5 text-blue-900 text-xs">
                      <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                      <div className="leading-snug">
                        <span className="font-bold block">Aguarde alguns segundos para confirmação</span>
                        <span className="text-[11px] text-blue-700 flex items-center gap-1.5 mt-0.5">
                          <Loader2 className="h-3 w-3 animate-spin inline shrink-0" />
                          Verificando pagamento em tempo real...
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ========================================================================= */
                  /* ETAPA 3: CARTÃO DE CRÉDITO (CHECKOUT MODERNO MERCADO PAGO)                */
                  /* ========================================================================= */
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <button
                      type="button"
                      onClick={() => setMethod(null)}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-[#FF5500] transition cursor-pointer"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Outras opções de pagamento</span>
                    </button>

                    {chosenPeriod && (
                      <ModernCardCheckout
                        amountCents={Math.ceil(chosenPeriod.price_cents / (1 - 4.99 / 100))}
                        baseCents={chosenPeriod.price_cents}
                        itemTitle={`Renovação ${chosenPeriod.label}`}
                        onSubmit={handleCardSubmit}
                        onSuccess={() => {
                          setPaymentStatus("approved");
                          void refetch();
                        }}
                        onCancel={() => setRenewOpen(false)}
                        accentColor="#FF5500"
                      />
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* DIALOG DA LOJA DE PRODUTOS AVULSOS                                        */}
      {/* ========================================================================= */}
      <Dialog
        open={storeOpen}
        onOpenChange={(o) => {
          setStoreOpen(o);
          if (!o) {
            setStoreItem(null);
            setStoreMethod(null);
            setStoreQrBase64(null);
            setStorePixPayload("");
            setStoreCardLink(null);
            if (paymentStatus !== "approved") {
              setRenewalId(null);
              setPaymentStatus("pending");
            }
          }
        }}
      >
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-3xl border-none shadow-2xl bg-[#F4F5F7] [&>button:last-child]:hidden">
          <div className="bg-[#FF5500] text-white px-5 py-4 flex items-center justify-between">
            <span className="font-bold text-sm sm:text-base tracking-tight text-white">
              {storeItem ? storeItem.label : "Loja de Produtos VIP"}
            </span>
            <button
              type="button"
              onClick={() => setStoreOpen(false)}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold transition cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="p-4 sm:p-5 max-h-[80vh] overflow-y-auto space-y-4">
            {paymentStatus === "approved" ? (
              <div className="flex flex-col items-center gap-4 py-8 text-center bg-white rounded-2xl p-6 shadow-sm">
                <div className="grid h-20 w-20 place-items-center rounded-full bg-emerald-500/15 animate-in zoom-in duration-500">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500" strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-emerald-600">Pagamento confirmado!</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    O acesso será entregue em instantes no seu WhatsApp cadastrado.
                  </p>
                </div>
                <Button
                  className="w-full bg-[#FF5500] hover:bg-[#E04B00] text-white font-bold rounded-xl py-3"
                  onClick={() => setStoreOpen(false)}
                >
                  Concluir
                </Button>
              </div>
            ) : !storeItem ? (
              <div className="grid grid-cols-2 gap-2.5">
                {storeProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openStoreItem(p)}
                    className="p-3 bg-white rounded-2xl border border-slate-100 hover:border-orange-300 shadow-sm flex flex-col items-center text-center transition active:scale-95 cursor-pointer"
                  >
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${p.gradient} flex items-center justify-center text-2xl text-white shadow-md mb-2`}>
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.label} className="w-full h-full object-cover rounded-2xl" />
                      ) : (
                        p.emoji || "🛍️"
                      )}
                    </div>
                    <span className="text-xs font-bold text-slate-800 leading-tight line-clamp-2">
                      {p.label}
                    </span>
                    <span className="text-xs font-black text-[#FF5500] mt-1">
                      {brl(p.price_cents)}
                    </span>
                  </button>
                ))}
              </div>
            ) : !storeMethod ? (
              <div className="space-y-3">
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-400 uppercase font-bold block">Produto Selecionado</span>
                    <span className="text-sm font-bold text-slate-800">{storeItem.label}</span>
                  </div>
                  <span className="text-lg font-black text-[#FF5500]">{brl(storeItem.price_cents)}</span>
                </div>

                <span className="text-xs font-bold text-slate-800 block px-1">Escolha como pagar:</span>

                <button
                  type="button"
                  onClick={() => chooseStoreMethod("pix")}
                  className="w-full bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:border-emerald-400 flex items-center justify-between transition cursor-pointer active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <QrCode className="h-6 w-6" />
                    </div>
                    <div className="text-left">
                      <span className="text-sm font-bold text-slate-900 block">Pix</span>
                      <span className="text-xs text-slate-500 block">Liberação imediata</span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-300" />
                </button>

                <button
                  type="button"
                  onClick={() => chooseStoreMethod("card")}
                  className="w-full bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:border-orange-400 flex items-center justify-between transition cursor-pointer active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-orange-50 text-[#FF5500] flex items-center justify-center shrink-0">
                      <CreditCard className="h-6 w-6" />
                    </div>
                    <div className="text-left">
                      <span className="text-sm font-bold text-slate-900 block">Cartão de crédito</span>
                      <span className="text-xs text-slate-500 block">Até 12x</span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-300" />
                </button>

                <button
                  type="button"
                  onClick={() => setStoreItem(null)}
                  className="w-full py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Voltar aos produtos
                </button>
              </div>
            ) : storeMethod === "pix" ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setStoreMethod(null)}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-[#FF5500] transition cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Voltar</span>
                </button>

                {storeCreating && (
                  <div className="bg-white rounded-2xl p-8 text-center space-y-3 shadow-sm border border-slate-100">
                    <Loader2 className="h-8 w-8 animate-spin text-[#FF5500] mx-auto" />
                    <span className="text-xs font-bold text-slate-600 block">Gerando QR Code PIX...</span>
                  </div>
                )}

                {storeQrBase64 && !storeCreating && (
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col items-center justify-center">
                    <img
                      src={`data:image/png;base64,${storeQrBase64}`}
                      alt="QR Code PIX"
                      className="w-52 h-52 object-contain rounded-xl"
                    />
                  </div>
                )}

                {storePixPayload && !storeCreating && (
                  <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
                    <span className="text-xs font-bold text-slate-700 block">Código Pix Copia e Cola</span>
                    <button
                      type="button"
                      onClick={() => void copy(storePixPayload)}
                      className="w-full bg-[#FF5500] hover:bg-[#E04B00] text-white font-bold py-3.5 rounded-xl shadow-sm transition"
                    >
                      Copiar código PIX
                    </button>
                  </div>
                )}

                <div className="bg-blue-50 border border-blue-200/80 rounded-2xl p-3.5 flex items-center gap-2.5 text-blue-900 text-xs">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />
                  <span>Aguardando pagamento... A liberação é automática.</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setStoreMethod(null)}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-[#FF5500] transition cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Voltar</span>
                </button>
                {storeItem && (
                  <ModernCardCheckout
                    amountCents={Math.ceil(storeItem.price_cents / (1 - 4.99 / 100))}
                    baseCents={storeItem.price_cents}
                    itemTitle={storeItem.label}
                    onSubmit={handleStoreCardSubmit}
                    onSuccess={() => {
                      setPaymentStatus("approved");
                      void refetch();
                    }}
                    onCancel={() => setStoreOpen(false)}
                    accentColor="#FF5500"
                  />
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* DIALOG DE SUPORTE INTELIGENTE IA                                          */}
      {/* ========================================================================= */}
      <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
        <DialogContent className="max-w-md h-[85vh] flex flex-col p-0 overflow-hidden rounded-3xl border-none shadow-2xl bg-white [&>button:last-child]:hidden">
          <div className="p-4 border-b bg-[#FF5500] text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white">
                <BrainCircuit className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-sm font-bold text-white">Especialista de Instalação</DialogTitle>
                <DialogDescription className="text-[10px] text-white/80 uppercase font-semibold">
                  Assistente Virtual 24h
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSupportOpen(false)}
              className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center font-bold"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F4F5F7]">
            {supportHistory.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-3 py-10 px-4">
                <div className="w-16 h-16 rounded-full bg-orange-100 text-[#FF5500] flex items-center justify-center shadow-sm">
                  <Tv className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Precisa de ajuda para instalar?</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    Informe qual é a marca do seu aparelho (Samsung, LG, Roku, Fire TV, TV Box, celular, etc.) e receba o passo a passo na hora.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSupportInput("Olá, como instalo na minha Smart TV?");
                    setTimeout(() => {
                      document.getElementById("support-submit-btn")?.click();
                    }, 50);
                  }}
                  className="px-4 py-2 rounded-full bg-white border border-slate-200 text-xs font-bold text-[#FF5500] hover:bg-orange-50 shadow-sm transition"
                >
                  Iniciar com Smart TV
                </button>
                <a
                  href="https://wa.me/5519981356505?text=Olá,%20gostaria%20de%20atendimento%20humano%20para%20configuração"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3.5 py-1.5 rounded-full border border-emerald-200 transition mt-2"
                >
                  <Headphones className="h-3.5 w-3.5" />
                  Falar com Atendente Humano (WhatsApp)
                </a>
              </div>
            ) : (
              supportHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[#FF5500] text-white rounded-tr-none shadow-sm font-medium"
                        : "bg-white text-slate-800 border border-slate-100 rounded-tl-none shadow-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-3 border-t bg-white">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!supportInput.trim()) return;
                const msg = supportInput;
                setSupportInput("");
                setSupportHistory((prev) => [...prev, { role: "user", content: msg }]);
                try {
                  const res = await portalFetch<any>("/api/public/portal/ai-agent-chat", {
                    method: "POST",
                    body: JSON.stringify({ sessionId: supportSession, message: msg, history: supportHistory || [] }),
                  });
                  if (res.error) throw new Error(res.error);
                  setSupportHistory(res.history);
                } catch {
                  toast.error("Erro na comunicação com o assistente.");
                }
              }}
              className="flex gap-2"
            >
              <Input
                placeholder="Qual o seu aparelho? (Ex: Smart TV LG)..."
                value={supportInput}
                onChange={(e) => setSupportInput(e.target.value)}
                className="rounded-xl bg-slate-50 border-slate-200 text-xs focus-visible:ring-[#FF5500]"
              />
              <Button
                id="support-submit-btn"
                type="submit"
                size="sm"
                className="rounded-xl bg-[#FF5500] hover:bg-[#E04B00] text-white px-4 shrink-0"
              >
                Enviar
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* DIALOG DE NOVIDADES E ATUALIZAÇÕES                                        */}
      {/* ========================================================================= */}
      <Dialog open={updatesKind !== null} onOpenChange={(o) => !o && setUpdatesKind(null)}>
        <DialogContent className="max-w-md max-h-[85vh] p-0 overflow-hidden rounded-3xl border-none shadow-2xl bg-[#F4F5F7] [&>button:last-child]:hidden">
          <div className="bg-[#FF5500] text-white px-5 py-4 flex items-center justify-between">
            <span className="font-bold text-sm sm:text-base text-white">
              {updatesKind === "movie"
                ? "🎬 Filmes adicionados"
                : updatesKind === "series"
                  ? "📺 Séries adicionadas"
                  : "⚽ Jogos do Dia"}
            </span>
            <button
              type="button"
              onClick={() => setUpdatesKind(null)}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center font-bold"
            >
              ✕
            </button>
          </div>

          <div className="p-4 overflow-y-auto space-y-3 max-h-[70vh]">
            {(() => {
              const movieGroups = parseUpdatesText(data.settings.updates_movies_text);
              const seriesGroups = parseUpdatesText(data.settings.updates_series_text);
              const gamesGroups = parseUpdatesText(data.settings.updates_games_text);
              const activeGroups =
                updatesKind === "movie" ? movieGroups : updatesKind === "series" ? seriesGroups : gamesGroups;
              const raw =
                updatesKind === "games"
                  ? data.settings.updates_games_text
                  : updatesKind === "series"
                    ? data.settings.updates_series_text
                    : data.settings.updates_movies_text;

              if (!raw || !raw.trim()) {
                return (
                  <div className="bg-white rounded-2xl p-6 text-center text-xs text-slate-400">
                    Nenhuma atualização disponível no momento.
                  </div>
                );
              }

              if (activeGroups.length === 0) {
                return (
                  <div className="bg-white rounded-2xl p-4 text-xs font-mono text-slate-700 whitespace-pre-wrap">
                    {raw}
                  </div>
                );
              }

              return activeGroups.map((g) => (
                <div key={g.category} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#FF5500] mb-2">
                    {g.category} <span className="text-[10px] text-slate-400">({g.items.length})</span>
                  </div>
                  <ul className="space-y-1 text-xs text-slate-700">
                    {g.items.map((it, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ));
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </PortalShell>
  );
}
