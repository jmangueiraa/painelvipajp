import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, CreditCard, Gift, LogOut, RefreshCw, Server as ServerIcon, Tv, Download, Copy, Check, CheckCircle2, ChevronUp, Smartphone, ExternalLink, Loader2, ShoppingBag, BrainCircuit } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { brl, formatDateBR } from "@/lib/format";
import { clearPortalToken, getPortalToken, portalFetch, PortalFetchError } from "@/lib/portal-client";
import { InstallAppCard } from "@/components/portal/install-app-card";
import { PushNotificationCard } from "@/components/portal/push-notification-card";

export const Route = createFileRoute("/portal/painel")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Meu Painel — Portal do Cliente" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0F172A" },
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
  settings: { referral_reward_days: number; referral_enabled: boolean; app_android_url: string | null; app_ios_url: string | null; updates_movies_text: string | null; updates_series_text: string | null; updates_movies_updated_at: string | null; updates_series_updated_at: string | null; updates_games_text: string | null; updates_games_updated_at: string | null };
  plans: { id: string; name: string; price_cents: number; duration_days: number }[];
  updates: { id: string; kind: "movie" | "series"; title: string; description: string | null; image_url: string | null; created_at: string }[];
};

function statusColor(s: string) {
  if (s === "ativo") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (s === "vencido") return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
}

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
      // Plain text line — treat as an item too so nothing is lost
      ensureCurrent().items.push(line);
    }
  }
  return groups.filter((g) => g.items.length > 0);
}


function PortalDashboard() {
  const navigate = useNavigate();
  const [renewOpen, setRenewOpen] = useState(false);
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
  const [payPage, setPayPage] = useState(1);
  const pollRef = useRef<number | null>(null);
  const [updatesKind, setUpdatesKind] = useState<"movie" | "series" | "games" | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportInput, setSupportInput] = useState("");
  const [supportHistory, setSupportHistory] = useState<any[]>([]);
  const [supportSession] = useState(() => `portal-session-${Math.random().toString(36).slice(2)}`);


  // Open updates dialog automatically when navigated with ?updates=movie|series|games
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const u = params.get("updates");
    if (u === "movie" || u === "series" || u === "games") {
      setUpdatesKind(u);
      params.delete("updates");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  // Loja de produtos avulsos (lê do admin via API; fallback para padrão)
  type StoreItem = { id: string; label: string; price_cents: number; emoji: string; gradient: string; image_url?: string | null };
  const fallbackProducts: StoreItem[] = [
    { id: "chatgpt", label: "ChatGPT Plus - 30 dias", price_cents: 3000, emoji: "🤖", gradient: "from-emerald-500 to-teal-600" },
    { id: "spotify", label: "Spotify Premium - 30 dias", price_cents: 1500, emoji: "🎵", gradient: "from-green-500 to-emerald-600" },
    { id: "youtube", label: "YouTube Premium - 30 dias", price_cents: 1500, emoji: "▶️", gradient: "from-red-500 to-rose-600" },
    { id: "smatone", label: "Smatone - 1 ano", price_cents: 2000, emoji: "🔑", gradient: "from-indigo-500 to-purple-600" },
    { id: "globoplay", label: "Globo Play - 30 dias", price_cents: 1500, emoji: "📺", gradient: "from-blue-500 to-sky-600" },
    { id: "primevideo", label: "Prime Video - 30 dias", price_cents: 1500, emoji: "🎬", gradient: "from-sky-500 to-blue-700" },
    { id: "netflix", label: "Netflix 1 tela - 30 dias", price_cents: 1500, emoji: "🎞️", gradient: "from-red-600 to-black" },
  ];
  const { data: remoteProducts } = useQuery({
    queryKey: ["portal-store-products"],
    queryFn: async () => {
      const j = await portalFetch<{ products: StoreItem[] }>("/api/public/portal/store-products");
      return j.products ?? [];
    },
  });
  const storeProducts: StoreItem[] = remoteProducts && remoteProducts.length > 0 ? remoteProducts : fallbackProducts;
  const [storeOpen, setStoreOpen] = useState(false);
  const [storeItem, setStoreItem] = useState<StoreItem | null>(null);
  const [storeMethod, setStoreMethod] = useState<"pix" | "card" | null>(null);
  const [storeQrBase64, setStoreQrBase64] = useState<string | null>(null);
  const [storePixPayload, setStorePixPayload] = useState<string>("");
  const [storeCardLink, setStoreCardLink] = useState<string | null>(null);
  const [storeCreating, setStoreCreating] = useState(false);


  useEffect(() => {
    if (!getPortalToken()) navigate({ to: "/portal" });
  }, [navigate]);

  // Inicializa notificações push (FCM) após login
  useEffect(() => {
    if (!getPortalToken()) return;
    const t = window.setTimeout(() => {
      import("@/lib/fcm").then((m) => m.initPortalPush({ silent: true })).catch(() => {});
    }, 2500);
    return () => window.clearTimeout(t);
  }, []);

  // Marca cliente como "App instalado" sempre que o portal for aberto em modo standalone (PWA)
  useEffect(() => {
    if (!getPortalToken()) return;
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
  }, []);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["portal", "me"],
    queryFn: () => portalFetch<Me>("/api/public/portal/me"),
    retry: false,
  });

  useEffect(() => {
    if (error && error instanceof PortalFetchError && error.status === 401) {
      clearPortalToken();
      navigate({ to: "/portal" });
    }
  }, [error, navigate]);

  // Polling do status do pagamento
  useEffect(() => {
    if (!renewalId) return;
    if (paymentStatus === "approved" || paymentStatus === "rejected" || paymentStatus === "cancelled") return;
    pollRef.current = window.setInterval(async () => {
      try {
        const r = await portalFetch<{ status: string }>(`/api/public/portal/renewal-status?id=${renewalId}`);
        if (r.status && r.status !== paymentStatus) {
          setPaymentStatus(r.status);
          if (r.status === "approved") {
            toast.success("Pagamento confirmado!");
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
      } catch { /* noop */ }
    }, 5000);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [renewalId, paymentStatus, refetch]);


  const renew = useMutation({
    mutationFn: (o: { days: number; amount_cents: number; label: string }) =>
      portalFetch<{ renewal_id: string; payment_id: string; qr_code: string; qr_code_base64: string }>(
        "/api/public/portal/mp-create-pix",
        { method: "POST", body: JSON.stringify(o) },
      ),
    onSuccess: (r) => {
      setRenewalId(r.renewal_id);
      setPaymentId(r.payment_id);
      setPixPayload(r.qr_code);
      setQrBase64(r.qr_code_base64);
      setPaymentStatus("pending");
      toast.success("QR Code PIX gerado!");
    },
    onError: (e: Error) => { toast.error(e.message); setPixPeriod(null); setMethod(null); },
    onSettled: () => setCreating(false),
  });

  const renewCard = useMutation({
    mutationFn: (o: { days: number; amount_cents: number; label: string }) =>
      portalFetch<{ renewal_id: string; init_point: string; amount_cents: number; base_cents: number }>(
        "/api/public/portal/mp-create-card",
        { method: "POST", body: JSON.stringify(o) },
      ),
    onSuccess: (r) => {
      setRenewalId(r.renewal_id);
      setPaymentStatus("pending");
      setCardLink(r.init_point);
      window.location.assign(r.init_point);
    },
    onError: (e: Error) => { toast.error(e.message); setMethod(null); },
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
    onError: (e: Error) => { toast.error(e.message); setStoreMethod(null); },
    onSettled: () => setStoreCreating(false),
  });

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
    setStoreCreating(true);
    buyExtra.mutate({ method: m, product_key: storeItem.id, label: storeItem.label, amount_cents: storeItem.price_cents });
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
    setCreating(true);
    renewCard.mutate({ days: chosenPeriod.days, amount_cents: chosenPeriod.price_cents, label: chosenPeriod.label });
  }

  function selectPeriod(o: { label: string; days: number; price_cents: number }) {
    setChosenPeriod(o);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setValCopied(true);
      setTimeout(() => setValCopied(false), 2000);
      toast.success("Copiado!");
    } catch {
      toast.error("Não foi possível copiar");
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
      <style>body{font-family:system-ui,sans-serif;max-width:520px;margin:40px auto;padding:24px;color:#0f172a}
      h1{margin:0 0 4px 0;font-size:20px} .muted{color:#64748b;font-size:13px}
      .row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px dashed #cbd5e1}
      .total{font-size:22px;font-weight:700;margin-top:18px}
      .stamp{margin-top:32px;padding:14px;border:2px solid #10b981;color:#059669;text-align:center;border-radius:12px;font-weight:600}
      </style></head><body>
      <h1>Comprovante de Pagamento</h1>
      <div class="muted">Recibo nº ${p.id.slice(0, 8).toUpperCase()}</div>
      <div style="margin-top:24px">
        <div class="row"><span>Cliente</span><strong>${data.client.name}</strong></div>
        <div class="row"><span>WhatsApp</span><span>${data.client.phone}</span></div>
        <div class="row"><span>Plano</span><span>${data.plan?.name ?? "—"}</span></div>
        <div class="row"><span>Forma</span><span>${p.method ?? "—"}</span></div>
        <div class="row"><span>Data</span><span>${formatDateBR(p.paid_at)}</span></div>
        <div class="row total"><span>Valor pago</span><span>${brl(p.amount_cents)}</span></div>
      </div>
      <div class="stamp">PAGO</div>
      <script>window.print()</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return toast.error("Permita pop-ups para baixar o comprovante");
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  if (isLoading || !data) {
    return <div className="min-h-dvh grid place-items-center text-muted-foreground">Carregando…</div>;
  }

  const dueDays = Math.ceil((new Date(data.client.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const overdue = dueDays < 0;
  const displayStatus =
    data.client.status === "suspenso" || data.client.status === "cancelado"
      ? data.client.status
      : overdue
        ? "vencido"
        : "ativo";

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div>
            <div className="text-xs text-muted-foreground">Olá,</div>
            <div className="font-semibold">{data.client.name}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />Sair
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <InstallAppCard />
        <PushNotificationCard />

        {/* Status do plano */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base">Meu plano</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{data.plan?.name ?? "Sem plano"}</p>
              </div>
              <Badge className={statusColor(displayStatus)}>{displayStatus}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="text-xs text-muted-foreground">Vencimento</div>
                <div className="font-semibold">{formatDateBR(data.client.due_date)}</div>
              </div>
              <div className={`text-sm font-medium ${overdue ? "text-rose-600" : "text-emerald-600"}`}>
                {overdue ? `Vencido há ${Math.abs(dueDays)}d` : `Faltam ${dueDays}d`}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border bg-card p-3">
                <div className="text-xs text-muted-foreground">Valor</div>
                <div className="font-semibold">{brl(data.client.price_cents)}</div>
              </div>
              {data.server && (
                <div className="rounded-xl border bg-card p-3">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground"><ServerIcon className="h-3 w-3" />Servidor</div>
                  <div className="font-semibold truncate">{data.server.name}</div>
                </div>
              )}
            </div>

            <Button className="w-full" size="lg" onClick={() => setRenewOpen(true)}>
              <RefreshCw className="mr-2 h-4 w-4" />Renovar agora
            </Button>
          </CardContent>
        </Card>

        {/* Atualizações */}
        {(() => {
          const movieGroups = parseUpdatesText(data.settings.updates_movies_text);
          const seriesGroups = parseUpdatesText(data.settings.updates_series_text);
          const gamesGroups = parseUpdatesText(data.settings.updates_games_text);
          const movieCount = movieGroups.reduce((acc, g) => acc + g.items.length, 0);
          const seriesCount = seriesGroups.reduce((acc, g) => acc + g.items.length, 0);
          const gamesCount = gamesGroups.reduce((acc, g) => acc + g.items.length, 0);
          const activeGroups = updatesKind === "movie" ? movieGroups : updatesKind === "series" ? seriesGroups : updatesKind === "games" ? gamesGroups : [];
          const moviesUpdatedAt = data.settings.updates_movies_updated_at;
          const seriesUpdatedAt = data.settings.updates_series_updated_at;
          const gamesUpdatedAt = data.settings.updates_games_updated_at;
          const activeUpdatedAt = updatesKind === "movie" ? moviesUpdatedAt : updatesKind === "series" ? seriesUpdatedAt : updatesKind === "games" ? gamesUpdatedAt : null;
          const fmtDate = (iso: string | null) => {
            if (!iso) return null;
            try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return null; }
          };
          const dialogTitle = updatesKind === "movie" ? "🎬 Filmes adicionados" : updatesKind === "series" ? "📺 Séries adicionadas" : "⚽ Jogos do Dia";
          return (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base"><Smartphone className="h-4 w-4" />Atualizações</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-3">
                  <button type="button" onClick={() => setUpdatesKind("movie")} className="inline-flex flex-col items-center justify-center gap-1 rounded-xl border bg-card px-3 py-3 text-sm font-medium transition hover:border-primary/50 hover:bg-primary/5">
                    <span className="inline-flex items-center gap-2">🎬 Filmes</span>
                    <span className="text-xs text-muted-foreground">{movieCount} novidades</span>
                    {fmtDate(moviesUpdatedAt) && <span className="text-[10px] text-muted-foreground">Atualizado {fmtDate(moviesUpdatedAt)}</span>}
                  </button>
                  <button type="button" onClick={() => setUpdatesKind("series")} className="inline-flex flex-col items-center justify-center gap-1 rounded-xl border bg-card px-3 py-3 text-sm font-medium transition hover:border-primary/50 hover:bg-primary/5">
                    <span className="inline-flex items-center gap-2">📺 Séries</span>
                    <span className="text-xs text-muted-foreground">{seriesCount} novidades</span>
                    {fmtDate(seriesUpdatedAt) && <span className="text-[10px] text-muted-foreground">Atualizado {fmtDate(seriesUpdatedAt)}</span>}
                  </button>
                  <button type="button" onClick={() => setUpdatesKind("games")} className="inline-flex flex-col items-center justify-center gap-1 rounded-xl border bg-card px-3 py-3 text-sm font-medium transition hover:border-primary/50 hover:bg-primary/5">
                    <span className="inline-flex items-center gap-2">⚽ Jogos</span>
                    <span className="text-xs text-muted-foreground">{gamesCount} hoje</span>
                    {fmtDate(gamesUpdatedAt) && <span className="text-[10px] text-muted-foreground">Atualizado {fmtDate(gamesUpdatedAt)}</span>}
                  </button>
                </CardContent>
              </Card>

              <Dialog open={updatesKind !== null} onOpenChange={(o) => !o && setUpdatesKind(null)}>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{dialogTitle}</DialogTitle>
                    <DialogDescription>
                      {fmtDate(activeUpdatedAt) ? `Última atualização: ${fmtDate(activeUpdatedAt)}` : "Confira as novidades organizadas por categoria."}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 mt-2">
                    {updatesKind === "games" || updatesKind === "series" ? (
                      (() => {
                        const raw = updatesKind === "games" ? data.settings.updates_games_text : data.settings.updates_series_text;
                        return raw && raw.trim() ? (
                          <div className="rounded-xl border bg-card/50 p-3">
                            <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground/90 leading-relaxed">{raw}</pre>
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground text-center py-6">Nenhuma atualização disponível no momento.</div>
                        );
                      })()

                    ) : (
                      <>
                        {activeGroups.length === 0 && (
                          <div className="text-sm text-muted-foreground text-center py-6">Nenhuma atualização disponível no momento.</div>
                        )}
                        {activeGroups.map((g) => (
                          <div key={g.category} className="rounded-xl border bg-card/50 p-3">
                            <div className="text-xs font-semibold uppercase tracking-wide text-primary mb-2">
                              {g.category}
                              <span className="ml-2 text-[10px] text-muted-foreground normal-case font-normal">({g.items.length})</span>
                            </div>
                            <ol className="space-y-1 list-decimal list-inside text-sm">
                              {g.items.map((it, i) => (
                                <li key={i} className="text-foreground/90 marker:text-muted-foreground">{it}</li>
                              ))}
                            </ol>
                          </div>
                        ))}
                      </>
                    )}
                  </div>

                </DialogContent>
              </Dialog>
            </>
          );
        })()}

        {/* Loja de produtos avulsos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">🛒 Loja</CardTitle>
            <p className="text-xs text-muted-foreground">Toque em um produto para pagar via PIX ou cartão.</p>
          </CardHeader>
          <CardContent>
            <div className="-mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {storeProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openStoreItem(p)}
                  className="group flex w-28 shrink-0 snap-start flex-col items-center gap-2 rounded-xl border bg-card p-3 text-center transition hover:border-primary/50 hover:shadow-md"
                >
                  <div className={`grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br ${p.gradient} text-white shadow-md transition group-hover:scale-105`}>
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.label} className="h-full w-full object-cover" />
                    ) : (
                      <ShoppingBag className="h-7 w-7" />
                    )}
                  </div>

                  <div className="text-xs font-semibold leading-tight">{p.label}</div>
                  <div className="text-sm font-bold text-primary">{brl(p.price_cents)}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>


        {/* Histórico de pagamentos */}
        <section>
          <div className="mb-3 flex items-center gap-2 px-1">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-muted-foreground">Pagas</h2>
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          </div>
          {data.payments.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">Nenhum pagamento registrado ainda.</p>
          ) : (() => {
            const pageSize = 10;
            const totalPages = Math.max(1, Math.ceil(data.payments.length / pageSize));
            const page = Math.min(payPage, totalPages);
            const start = (page - 1) * pageSize;
            const slice = data.payments.slice(start, start + pageSize);
            return (
              <>
                <ul className="space-y-2">
                  {slice.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm transition hover:border-primary/40"
                    >
                      <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" strokeWidth={2} />
                      <div className="flex-1">
                        <div className="text-xs text-muted-foreground">Vencimento</div>
                        <div className="text-base font-bold tracking-tight">{formatDateBR(p.paid_at)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Original</div>
                        <div className="text-base font-bold tracking-tight">{brl(p.amount_cents)}</div>
                      </div>
                      <button
                        onClick={() => downloadReceipt(p)}
                        className="ml-1 grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                        aria-label="Baixar comprovante"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                {totalPages > 1 && (
                  <div className="mt-3 flex items-center justify-between px-1 text-xs text-muted-foreground">
                    <span>Página {page} de {totalPages} · {data.payments.length} pagamentos</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPayPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="rounded-md border px-3 py-1 disabled:opacity-40 hover:bg-muted"
                      >Anterior</button>
                      <button
                        onClick={() => setPayPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="rounded-md border px-3 py-1 disabled:opacity-40 hover:bg-muted"
                      >Próxima</button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </section>


        {/* Indique e ganhe */}
        {data.settings.referral_enabled && data.client.referral_code && (
          <Link to="/portal/indique">
            <Card className="cursor-pointer transition hover:border-primary/50">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600">
                  <Gift className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold">Indique e ganhe {data.settings.referral_reward_days} dias grátis</div>
                  <div className="text-xs text-muted-foreground">
                    {data.referrals.length} indicados · {data.client.bonus_days} dias bônus acumulados
                  </div>
                </div>
                <div className="text-muted-foreground">›</div>
              </CardContent>
            </Card>
          </Link>
        )}

        {/* Agente de Suporte IA */}
        <Card className="overflow-hidden border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <BrainCircuit className="h-4 w-4 text-primary" /> Suporte Inteligente AJP
              </CardTitle>
              <Badge variant="outline" className="bg-background text-[9px] uppercase tracking-tighter">Online 24h</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Precisa de ajuda para instalar? Nosso especialista IA pode te guiar passo a passo agora mesmo.
            </p>
            <Button className="w-full" variant="outline" onClick={() => setSupportOpen(true)}>
              Falar com Especialista
            </Button>
          </CardContent>
        </Card>
      </main>

      <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
        <DialogContent className="max-w-md h-[80vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                <BrainCircuit className="size-6 text-primary" />
              </div>
              <div className="flex flex-col text-left">
                <DialogTitle>Especialista de Instalação</DialogTitle>
                <DialogDescription className="text-[10px] uppercase tracking-widest font-bold">Assistente Virtual 24h</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {supportHistory.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-60">
                <Tv className="size-12 text-primary" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Como posso te ajudar hoje?</p>
                  <p className="text-xs">Identifico seu aparelho e te mostro como instalar.</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => {
                  setSupportInput("Olá, preciso de ajuda com a instalação.");
                  const mutation = document.getElementById("support-submit-btn");
                  if (mutation) setTimeout(() => mutation.click(), 50);
                }}>Iniciar Atendimento</Button>
              </div>
            ) : (
              supportHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                    msg.role === 'user' 
                      ? 'bg-primary text-primary-foreground rounded-tr-none' 
                      : 'bg-muted border border-border rounded-tl-none'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))
            )}
            {/* O Mutation será chamado via useServerFn similar ao admin */}
          </div>

          <div className="p-4 border-t bg-background">
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!supportInput.trim()) return;
              const msg = supportInput;
              setSupportInput("");
              setSupportHistory(prev => [...prev, { role: 'user', content: msg }]);
              try {
                // @ts-ignore - processAgentMessage is exported from ai-agent.functions
                const res = await portalFetch("/api/public/portal/ai-agent-chat", {
                  method: "POST",
                  body: JSON.stringify({ sessionId: supportSession, message: msg, history: supportHistory })
                });
                setSupportHistory(res.history);
              } catch (err) {
                toast.error("Erro na comunicação");
              }
            }} className="flex gap-2">
              <Input 
                placeholder="Diga qual seu aparelho..." 
                value={supportInput}
                onChange={(e) => setSupportInput(e.target.value)}
                className="rounded-full bg-muted/50 border-none focus-visible:ring-1"
              />
              <Button id="support-submit-btn" type="submit" size="icon" className="rounded-full shrink-0">
                <ChevronUp className="size-5" />
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>


      <Dialog open={renewOpen} onOpenChange={(o) => { setRenewOpen(o); if (!o) { setChosenPeriod(null); setMethod(null); setPixPeriod(null); setValCopied(false); setBrCopied(false); setQrBase64(null); setPixPayload(""); setRenewalId(null); setPaymentId(null); setPaymentStatus("pending"); setCardLink(null); } }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          {paymentStatus === "approved" ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-emerald-500/15 animate-in zoom-in duration-500">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-emerald-600 dark:text-emerald-400">Pagamento confirmado!</h2>
                <p className="mt-1 text-sm text-muted-foreground">Seu plano foi renovado com sucesso.</p>
              </div>
              <Button className="w-full" onClick={() => { setRenewOpen(false); setChosenPeriod(null); setMethod(null); setPixPeriod(null); setQrBase64(null); setPixPayload(""); setRenewalId(null); setPaymentId(null); setPaymentStatus("pending"); setCardLink(null); }}>
                Voltar ao painel
              </Button>
            </div>
          ) : (
          <>
          <DialogHeader>
            <div className="flex items-center justify-between gap-2 pr-6">
              <DialogTitle>Renovar plano</DialogTitle>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {data.client.points ?? 1} {(data.client.points ?? 1) === 1 ? "ponto" : "pontos"}
              </span>
            </div>
            <DialogDescription>
              {!chosenPeriod
                ? "Escolha o período. O valor é calculado conforme seu plano."
                : !method
                  ? "Escolha como deseja pagar."
                  : method === "pix"
                    ? "Escaneie o QR Code ou copie o código PIX abaixo."
                    : "Conclua o pagamento na aba do Mercado Pago."}
            </DialogDescription>
          </DialogHeader>

          {!chosenPeriod ? (
            <>
              {(() => {
                const monthly = data.plan?.price_cents ?? data.client.price_cents;
                if (!monthly || monthly <= 0) {
                  return <p className="text-sm text-muted-foreground">Plano mensal não configurado. Fale com seu provedor.</p>;
                }
                const periods = [
                  { label: "Mensal", days: 30, months: 1, discount: 0 },
                  { label: "Trimestral", days: 90, months: 3, discount: 0.15 },
                  { label: "Semestral", days: 180, months: 6, discount: 0.20 },
                  { label: "Anual", days: 365, months: 12, discount: 0.25 },
                ].map((p) => {
                  const full = monthly * p.months;
                  const price = Math.round(full * (1 - p.discount));
                  return { ...p, full, price };
                });
                return (
                  <div className="grid grid-cols-2 gap-2">
                    {periods.map((p) => (
                      <Button
                        key={p.label}
                        variant="outline"
                        className="h-auto py-3 relative"
                        onClick={() => selectPeriod({ label: p.label, days: p.days, price_cents: p.price })}
                      >
                        {p.discount > 0 && (
                          <span className="absolute -top-2 -right-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">
                            -{Math.round(p.discount * 100)}%
                          </span>
                        )}
                        <div className="flex flex-col items-start">
                          <span className="font-semibold">{p.label}</span>
                          <span className="text-xs text-muted-foreground">{p.days} dias</span>
                          {p.discount > 0 && (
                            <span className="text-[11px] text-muted-foreground line-through">{brl(p.full)}</span>
                          )}
                          <span className="text-xs text-primary font-medium">{brl(p.price)}</span>
                        </div>
                      </Button>
                    ))}
                  </div>
                );
              })()}
              <p className="text-xs text-muted-foreground">Pagamento via Mercado Pago. Após a confirmação, sua renovação é liberada automaticamente.</p>
            </>
          ) : !method ? (
            <div className="space-y-3">
              <div className="rounded-xl border bg-card p-3">
                <div className="text-xs text-muted-foreground">Plano selecionado</div>
                <div className="font-semibold">{chosenPeriod.label} · {chosenPeriod.days} dias</div>
                <div className="text-sm text-muted-foreground">Valor base: <strong className="text-foreground">{brl(chosenPeriod.price_cents)}</strong></div>
              </div>
              <Button
                variant="outline"
                className="w-full h-auto py-3 justify-start"
                onClick={choosePix}
              >
                <Smartphone className="mr-3 h-5 w-5 text-emerald-600" />
                <div className="flex flex-col items-start">
                  <span className="font-semibold">PIX</span>
                  <span className="text-xs text-muted-foreground">Aprovação imediata · {brl(chosenPeriod.price_cents)}</span>
                </div>
              </Button>
              {(() => {
                const cardTotal = Math.ceil(chosenPeriod.price_cents / (1 - 4.99 / 100));
                const fee = cardTotal - chosenPeriod.price_cents;
                return (
                  <Button
                    variant="outline"
                    className="w-full h-auto py-3 justify-start"
                    onClick={chooseCard}
                  >
                    <CreditCard className="mr-3 h-5 w-5 text-primary" />
                    <div className="flex flex-col items-start">
                      <span className="font-semibold">Cartão de crédito (até 12x)</span>
                      <span className="text-xs text-muted-foreground">
                        {brl(chosenPeriod.price_cents)} + taxa {brl(fee)} = <strong className="text-foreground">{brl(cardTotal)}</strong>
                      </span>
                    </div>
                  </Button>
                );
              })()}
              <p className="text-[11px] text-muted-foreground">A taxa do cartão (4,99%) é repassada para cobrir os custos do Mercado Pago.</p>
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setChosenPeriod(null)}>Voltar</Button>
            </div>
          ) : method === "pix" && pixPeriod ? (
            <div className="space-y-3">
              <div className="rounded-xl border bg-card p-3">
                <div className="text-xs text-muted-foreground">Plano</div>
                <div className="font-semibold">{pixPeriod.label} · {pixPeriod.days} dias</div>
              </div>

              <div className="rounded-xl border bg-card p-3">
                <div className="text-xs text-muted-foreground">Valor a pagar</div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xl font-bold">{brl(pixPeriod.price_cents)}</div>
                  <Button size="sm" variant="outline" onClick={() => copy((pixPeriod.price_cents / 100).toFixed(2))}>
                    {valCopied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}Copiar
                  </Button>
                </div>
              </div>

              {creating && (
                <div className="flex items-center justify-center gap-2 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />Gerando QR Code...
                </div>
              )}

              {qrBase64 && !creating && (
                <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-primary/40 bg-white p-3">
                  <img src={`data:image/png;base64,${qrBase64}`} alt="QR Code PIX" className="h-56 w-56" />
                  <div className="text-xs text-muted-foreground">Escaneie no app do seu banco</div>
                </div>
              )}

              {pixPayload && !creating && (
                <div className="rounded-xl border bg-card p-3">
                  <div className="mb-1 text-xs text-muted-foreground">PIX Copia e Cola</div>
                  <div className="break-all rounded-md bg-muted/50 p-2 font-mono text-[10px] leading-tight">{pixPayload}</div>
                  <Button size="sm" className="mt-2 w-full" onClick={() => { void navigator.clipboard.writeText(pixPayload); setBrCopied(true); setTimeout(() => setBrCopied(false), 2000); toast.success("Código PIX copiado!"); }}>
                    {brCopied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}Copiar código PIX
                  </Button>
                </div>
              )}

              {(() => {
                const s = paymentStatus;
                if (s === "rejected" || s === "cancelled") {
                  return (
                    <div className="rounded-xl border-2 border-rose-500/60 bg-rose-500/10 p-3 text-sm font-medium text-rose-700 dark:text-rose-300">
                      ❌ Falha no pagamento ({s === "rejected" ? "recusado" : "cancelado"}). Volte e gere um novo PIX.
                    </div>
                  );
                }
                if (s === "in_process") {
                  return (
                    <div className="flex items-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm font-medium text-amber-700 dark:text-amber-300">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      <span>Pagamento em análise pelo Mercado Pago...</span>
                    </div>
                  );
                }
                return (
                  <div className="flex items-center gap-2 rounded-xl border bg-card p-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    <span>Aguardando pagamento... A confirmação é automática.</span>
                  </div>
                );
              })()}

              {paymentId && <p className="text-[10px] text-muted-foreground text-center">ID do pagamento: {paymentId}</p>}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setMethod(null); setPixPeriod(null); setQrBase64(null); setPixPayload(""); setRenewalId(null); setPaymentId(null); setPaymentStatus("pending"); }}>Voltar</Button>
                <Button className="flex-1" onClick={() => setRenewOpen(false)}>Fechar</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border bg-card p-3">
                <div className="text-xs text-muted-foreground">Plano</div>
                <div className="font-semibold">{chosenPeriod.label} · {chosenPeriod.days} dias</div>
                {(() => {
                  const cardTotal = Math.ceil(chosenPeriod.price_cents / (1 - 4.99 / 100));
                  const fee = cardTotal - chosenPeriod.price_cents;
                  return (
                    <div className="mt-2 text-sm text-muted-foreground">
                      Valor: <strong className="text-foreground">{brl(chosenPeriod.price_cents)}</strong>
                      <span className="mx-1">+</span>
                      taxa {brl(fee)} ={" "}
                      <strong className="text-foreground">{brl(cardTotal)}</strong>
                    </div>
                  );
                })()}
              </div>

              {creating && (
                <div className="flex items-center justify-center gap-2 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />Abrindo checkout do cartão...
                </div>
              )}

              {cardLink && !creating && (
                <>
                  <a href={cardLink} className="block">
                    <Button className="w-full">
                      <ExternalLink className="mr-2 h-4 w-4" />Abrir checkout do cartão
                    </Button>
                  </a>
                  <div className="flex items-center gap-2 rounded-xl border bg-card p-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    <span>Aguardando confirmação do pagamento...</span>
                  </div>
                  {paymentStatus === "rejected" || paymentStatus === "cancelled" ? (
                    <div className="rounded-xl border-2 border-rose-500/60 bg-rose-500/10 p-3 text-sm font-medium text-rose-700 dark:text-rose-300">
                      ❌ Pagamento {paymentStatus === "rejected" ? "recusado" : "cancelado"}. Tente novamente.
                    </div>
                  ) : null}
                </>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setMethod(null); setCardLink(null); setRenewalId(null); setPaymentStatus("pending"); }}>Voltar</Button>
                <Button className="flex-1" onClick={() => setRenewOpen(false)}>Fechar</Button>
              </div>
            </div>
          )}
          </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog da loja de produtos avulsos */}
      <Dialog open={storeOpen} onOpenChange={(o) => { setStoreOpen(o); if (!o) { setStoreItem(null); setStoreMethod(null); setStoreQrBase64(null); setStorePixPayload(""); setStoreCardLink(null); if (paymentStatus !== "approved") { setRenewalId(null); setPaymentStatus("pending"); } } }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          {paymentStatus === "approved" ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-emerald-500/15 animate-in zoom-in duration-500">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-emerald-600 dark:text-emerald-400">Pagamento confirmado!</h2>
                <p className="mt-1 text-sm text-muted-foreground">Aguarde — sua solicitação foi enviada. O acesso será entregue em instantes pelo <strong className="text-emerald-600 dark:text-emerald-400">WhatsApp</strong>.</p>
              </div>
              <Button className="w-full" onClick={() => { setStoreOpen(false); setStoreItem(null); setStoreMethod(null); setStoreQrBase64(null); setStorePixPayload(""); setStoreCardLink(null); setRenewalId(null); setPaymentStatus("pending"); }}>
                Voltar ao painel
              </Button>
            </div>
          ) : storeItem ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className={`grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br ${storeItem.gradient} text-white`}><ShoppingBag className="h-4 w-4" /></span>
                  {storeItem.label}
                </DialogTitle>
                <DialogDescription>
                  {!storeMethod ? "Escolha como deseja pagar." : storeMethod === "pix" ? "Escaneie o QR Code ou copie o código PIX abaixo." : "Conclua o pagamento na aba do Mercado Pago."}
                </DialogDescription>
              </DialogHeader>

              {!storeMethod ? (
                <div className="space-y-3">
                  <div className="rounded-xl border bg-card p-3">
                    <div className="text-xs text-muted-foreground">Valor</div>
                    <div className="text-xl font-bold">{brl(storeItem.price_cents)}</div>
                  </div>
                  <Button variant="outline" className="w-full h-auto py-3 justify-start" onClick={() => chooseStoreMethod("pix")}>
                    <Smartphone className="mr-3 h-5 w-5 text-emerald-600" />
                    <div className="flex flex-col items-start">
                      <span className="font-semibold">PIX</span>
                      <span className="text-xs text-muted-foreground">Aprovação imediata · {brl(storeItem.price_cents)}</span>
                    </div>
                  </Button>
                  {(() => {
                    const cardTotal = Math.ceil(storeItem.price_cents / (1 - 4.99 / 100));
                    const fee = cardTotal - storeItem.price_cents;
                    return (
                      <Button variant="outline" className="w-full h-auto py-3 justify-start" onClick={() => chooseStoreMethod("card")}>
                        <CreditCard className="mr-3 h-5 w-5 text-primary" />
                        <div className="flex flex-col items-start">
                          <span className="font-semibold">Cartão de crédito (até 12x)</span>
                          <span className="text-xs text-muted-foreground">
                            {brl(storeItem.price_cents)} + taxa {brl(fee)} = <strong className="text-foreground">{brl(cardTotal)}</strong>
                          </span>
                        </div>
                      </Button>
                    );
                  })()}
                  <p className="text-[11px] text-muted-foreground">A taxa do cartão (4,99%) é repassada para cobrir os custos do Mercado Pago.</p>
                </div>
              ) : storeMethod === "pix" ? (
                <div className="space-y-3">
                  <div className="rounded-xl border bg-card p-3">
                    <div className="text-xs text-muted-foreground">Valor a pagar</div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xl font-bold">{brl(storeItem.price_cents)}</div>
                      <Button size="sm" variant="outline" onClick={() => copy((storeItem.price_cents / 100).toFixed(2))}>
                        {valCopied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}Copiar
                      </Button>
                    </div>
                  </div>

                  {storeCreating && (
                    <div className="flex items-center justify-center gap-2 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />Gerando QR Code...
                    </div>
                  )}

                  {storeQrBase64 && !storeCreating && (
                    <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-primary/40 bg-white p-3">
                      <img src={`data:image/png;base64,${storeQrBase64}`} alt="QR Code PIX" className="h-56 w-56" />
                      <div className="text-xs text-muted-foreground">Escaneie no app do seu banco</div>
                    </div>
                  )}

                  {storePixPayload && !storeCreating && (
                    <div className="rounded-xl border bg-card p-3">
                      <div className="mb-1 text-xs text-muted-foreground">PIX Copia e Cola</div>
                      <div className="break-all rounded-md bg-muted/50 p-2 font-mono text-[10px] leading-tight">{storePixPayload}</div>
                      <Button size="sm" className="mt-2 w-full" onClick={() => { void navigator.clipboard.writeText(storePixPayload); setBrCopied(true); setTimeout(() => setBrCopied(false), 2000); toast.success("Código PIX copiado!"); }}>
                        {brCopied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}Copiar código PIX
                      </Button>
                    </div>
                  )}

                  <div className="flex items-center gap-2 rounded-xl border bg-card p-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    <span>Aguardando pagamento... A confirmação é automática.</span>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => { setStoreMethod(null); setStoreQrBase64(null); setStorePixPayload(""); setRenewalId(null); setPaymentStatus("pending"); }}>Voltar</Button>
                    <Button className="flex-1" onClick={() => setStoreOpen(false)}>Fechar</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {(() => {
                    const cardTotal = Math.ceil(storeItem.price_cents / (1 - 4.99 / 100));
                    const fee = cardTotal - storeItem.price_cents;
                    return (
                      <div className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">
                        Valor: <strong className="text-foreground">{brl(storeItem.price_cents)}</strong>
                        <span className="mx-1">+</span>taxa {brl(fee)} = <strong className="text-foreground">{brl(cardTotal)}</strong>
                      </div>
                    );
                  })()}

                  {storeCreating && (
                    <div className="flex items-center justify-center gap-2 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />Abrindo checkout do cartão...
                    </div>
                  )}

                  {storeCardLink && !storeCreating && (
                    <>
                        <a href={storeCardLink} className="block">
                        <Button className="w-full"><ExternalLink className="mr-2 h-4 w-4" />Abrir checkout do cartão</Button>
                      </a>
                      <div className="flex items-center gap-2 rounded-xl border bg-card p-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                        <span>Aguardando confirmação do pagamento...</span>
                      </div>
                    </>
                  )}

                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => { setStoreMethod(null); setStoreCardLink(null); setRenewalId(null); setPaymentStatus("pending"); }}>Voltar</Button>
                    <Button className="flex-1" onClick={() => setStoreOpen(false)}>Fechar</Button>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>


      {/* refetch helper hidden */}
      <button hidden onClick={() => refetch()} />
    </div>
  );
}
