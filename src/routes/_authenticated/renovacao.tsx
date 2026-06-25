import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { RefreshCw, CalendarCheck, Copy, Loader2, CheckCircle2, QrCode, CreditCard, KeyRound, CalendarClock, Plus, Trash2, Star } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { brl, formatDateBR, parseBrlToCents } from "@/lib/format";
import { translateError } from "@/lib/translate-error";
import {
  createAppRenewalPix,
  createAppRenewalCardCheckout,
  checkAppRenewalStatus,
  CARD_FEE_PERCENT,
} from "@/lib/app-renewal.functions";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/renovacao")({
  head: () => ({ meta: [{ title: "Renovação — Painel VIP" }] }),
  component: RenovacaoPage,
});

type Settings = { subscription_expires_at: string | null; subscription_monthly_cents: number };
type RenewalPlan = { id: string; name: string; price_cents: number; duration_days: number; featured: boolean };

type PixData = {
  renewal_id: string;
  qr_code: string;
  qr_code_base64: string;
  amount_cents: number;
  days: number;
  plan_name: string;
};

type CardData = {
  renewal_id: string;
  init_point: string;
  amount_cents: number;
  base_cents: number;
  days: number;
  plan_name: string;
};

function RenovacaoPage() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const createPix = useServerFn(createAppRenewalPix);
  const createCard = useServerFn(createAppRenewalCardCheckout);
  const checkStatus = useServerFn(checkAppRenewalStatus);

  const [methodPlan, setMethodPlan] = useState<RenewalPlan | null>(null);
  const [loadingMethod, setLoadingMethod] = useState<"pix" | "card" | null>(null);
  const [pix, setPix] = useState<PixData | null>(null);
  const [card, setCard] = useState<CardData | null>(null);
  const [paid, setPaid] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data, refetch } = useQuery({
    queryKey: ["settings", user?.id, "renovacao"],
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

  const { data: plans = [] } = useQuery({
    queryKey: ["app_plans", "renovacao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_plans")
        .select("id,name,price_cents,duration_days,featured")
        .eq("active", true)
        .order("duration_days", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RenewalPlan[];
    },
  });

  const { data: lastPaid } = useQuery({
    queryKey: ["app_renewal_requests", "last_paid", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_renewal_requests")
        .select("amount_cents,days,paid_at,plan_id")
        .eq("status", "paid")
        .order("paid_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { amount_cents: number; days: number; paid_at: string | null; plan_id: string | null } | null;
    },
  });

  const expires = data?.subscription_expires_at;
  const days = expires ? Math.ceil((new Date(expires).getTime() - Date.now()) / 86_400_000) : null;
  const currentPlanValue = lastPaid?.amount_cents ?? data?.subscription_monthly_cents ?? 0;

  function cardAmount(price_cents: number) {
    return Math.ceil(price_cents / (1 - CARD_FEE_PERCENT / 100));
  }

  async function payPix() {
    if (!methodPlan) return;
    setLoadingMethod("pix");
    try {
      const res = await createPix({ data: { plan_id: methodPlan.id } });
      setPix(res);
      setCard(null);
      setMethodPlan(null);
      setPaid(false);
    } catch (e) {
      toast.error((e as Error).message || "Falha ao gerar PIX");
    } finally {
      setLoadingMethod(null);
    }
  }

  async function payCard() {
    if (!methodPlan) return;
    setLoadingMethod("card");
    try {
      const res = await createCard({ data: { plan_id: methodPlan.id } });
      setCard(res);
      setPix(null);
      setMethodPlan(null);
      setPaid(false);
      window.open(res.init_point, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message || "Falha ao iniciar checkout");
    } finally {
      setLoadingMethod(null);
    }
  }

  const activeRenewalId = pix?.renewal_id ?? card?.renewal_id ?? null;

  useEffect(() => {
    if (!activeRenewalId || paid) return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await checkStatus({ data: { renewal_id: activeRenewalId } });
        if (r.status === "paid") {
          setPaid(true);
          toast.success("Pagamento aprovado! Assinatura renovada.");
          refetch();
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // ignore polling errors
      }
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeRenewalId, paid, checkStatus, refetch]);

  function closePix(open: boolean) {
    if (!open) {
      setPix(null);
      setPaid(false);
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }

  function closeCard(open: boolean) {
    if (!open) {
      setCard(null);
      setPaid(false);
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }

  function copyCode() {
    if (!pix?.qr_code) return;
    navigator.clipboard.writeText(pix.qr_code);
    toast.success("Código Pix copiado");
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Renovação" description="Gerencie sua assinatura e renove via Pix ou Cartão" />

      <Card className="kpi-card" style={{ "--kpi-color": "var(--kpi-emerald)" } as React.CSSProperties}>
        <CardContent className="p-5 flex items-center gap-4">
          <div className="size-12 rounded-xl grid place-items-center bg-[color:color-mix(in_oklab,var(--kpi-emerald)_15%,transparent)] text-[color:var(--kpi-emerald)] shrink-0">
            <CalendarCheck className="size-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] tracking-widest uppercase text-muted-foreground">Status</p>
            <p className="text-xl md:text-2xl font-bold">
              {days === null ? "Defina sua assinatura em Configurações" : `${days} dia(s) restantes`}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {expires ? `Expira em ${formatDateBR(expires)}` : "Sem vencimento definido"} ·
              {" "}Valor do plano: <span className="font-medium text-foreground">{brl(currentPlanValue)}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <div>
        <p className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-3">
          Escolha o período de renovação
        </p>
        {plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum plano disponível no momento.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {plans.map((p) => (
              <button
                key={p.id}
                onClick={() => setMethodPlan(p)}
                className={`flex items-center justify-between rounded-xl border bg-card/60 px-4 py-4 text-left hover:bg-card transition ${p.featured ? "border-primary/60" : "border-border hover:border-primary/60"}`}
              >
                <span className="flex flex-col">
                  <span className="flex items-center gap-2 font-medium">
                    <RefreshCw className="size-4 text-primary" />
                    {p.name}
                  </span>
                  <span className="text-xs text-muted-foreground mt-0.5">{p.duration_days} dias</span>
                </span>
                <span className="text-[color:var(--kpi-emerald)] font-bold tabular-nums">{brl(p.price_cents)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Dialog: escolha da forma de pagamento */}
      <Dialog open={!!methodPlan} onOpenChange={(o) => !o && setMethodPlan(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Forma de pagamento</DialogTitle>
            <DialogDescription>
              {methodPlan ? `${methodPlan.name} — ${methodPlan.duration_days} dias` : ""}
            </DialogDescription>
          </DialogHeader>

          {methodPlan && (
            <div className="space-y-3">
              <button
                disabled={loadingMethod !== null}
                onClick={payPix}
                className="w-full flex items-center justify-between rounded-xl border border-border hover:border-[color:var(--kpi-emerald)] bg-card/60 hover:bg-card px-4 py-4 text-left transition disabled:opacity-60"
              >
                <span className="flex items-center gap-3">
                  <span className="size-10 rounded-lg grid place-items-center bg-[color:color-mix(in_oklab,var(--kpi-emerald)_15%,transparent)] text-[color:var(--kpi-emerald)]">
                    {loadingMethod === "pix" ? <Loader2 className="size-5 animate-spin" /> : <QrCode className="size-5" />}
                  </span>
                  <span className="flex flex-col">
                    <span className="font-medium">PIX</span>
                    <span className="text-xs text-muted-foreground">Aprovação imediata · sem taxa</span>
                  </span>
                </span>
                <span className="text-[color:var(--kpi-emerald)] font-bold tabular-nums">{brl(methodPlan.price_cents)}</span>
              </button>

              <button
                disabled={loadingMethod !== null}
                onClick={payCard}
                className="w-full flex items-center justify-between rounded-xl border border-border hover:border-primary bg-card/60 hover:bg-card px-4 py-4 text-left transition disabled:opacity-60"
              >
                <span className="flex items-center gap-3">
                  <span className="size-10 rounded-lg grid place-items-center bg-[color:color-mix(in_oklab,var(--primary)_15%,transparent)] text-primary">
                    {loadingMethod === "card" ? <Loader2 className="size-5 animate-spin" /> : <CreditCard className="size-5" />}
                  </span>
                  <span className="flex flex-col">
                    <span className="font-medium">Cartão de crédito</span>
                    <span className="text-xs text-muted-foreground">
                      Parcelado em até 12x · taxa de {CARD_FEE_PERCENT.toFixed(2).replace(".", ",")}% inclusa
                    </span>
                  </span>
                </span>
                <span className="text-primary font-bold tabular-nums">{brl(cardAmount(methodPlan.price_cents))}</span>
              </button>

              <p className="text-[11px] text-muted-foreground text-center">
                A taxa do cartão é repassada ao assinante. PIX não possui acréscimo.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog PIX */}
      <Dialog open={!!pix} onOpenChange={closePix}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pagamento via Pix</DialogTitle>
            <DialogDescription>
              {pix ? `${pix.plan_name} — ${brl(pix.amount_cents)} · ${pix.days} dias` : ""}
            </DialogDescription>
          </DialogHeader>

          {pix && !paid && (
            <div className="space-y-4">
              {pix.qr_code_base64 ? (
                <div className="flex justify-center">
                  <img
                    src={`data:image/png;base64,${pix.qr_code_base64}`}
                    alt="QR Code Pix"
                    className="w-56 h-56 rounded-lg border bg-white p-2"
                  />
                </div>
              ) : null}

              <div>
                <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">
                  Pix Copia e Cola
                </p>
                <div className="rounded-lg border bg-muted/40 p-3 text-xs break-all max-h-32 overflow-auto">
                  {pix.qr_code}
                </div>
              </div>

              <Button onClick={copyCode} className="w-full" variant="secondary">
                <Copy className="size-4 mr-2" /> Copiar código
              </Button>

              <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
                <Loader2 className="size-3 animate-spin" /> Aguardando confirmação do pagamento...
              </div>
            </div>
          )}

          {paid && pix && (
            <div className="text-center space-y-3 py-4">
              <CheckCircle2 className="size-12 mx-auto text-[color:var(--kpi-emerald)]" />
              <p className="font-semibold">Pagamento aprovado!</p>
              <p className="text-sm text-muted-foreground">Sua assinatura foi renovada.</p>
              <Button className="w-full" onClick={() => closePix(false)}>Fechar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Cartão */}
      <Dialog open={!!card} onOpenChange={closeCard}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pagamento via Cartão</DialogTitle>
            <DialogDescription>
              {card ? `${card.plan_name} — ${brl(card.amount_cents)} · ${card.days} dias` : ""}
            </DialogDescription>
          </DialogHeader>

          {card && !paid && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Abrimos o checkout seguro do Mercado Pago em uma nova aba. Conclua o pagamento por lá — esta tela será
                atualizada automaticamente quando aprovarmos.
              </p>
              <div className="rounded-lg border bg-muted/40 p-3 text-xs">
                Valor do plano: <span className="font-medium text-foreground">{brl(card.base_cents)}</span>
                <br />
                Taxa do cartão ({CARD_FEE_PERCENT.toFixed(2).replace(".", ",")}%):{" "}
                <span className="font-medium text-foreground">{brl(card.amount_cents - card.base_cents)}</span>
                <br />
                Total a pagar: <span className="font-semibold text-foreground">{brl(card.amount_cents)}</span>
              </div>
              <Button
                onClick={() => window.open(card.init_point, "_blank", "noopener")}
                className="w-full"
              >
                <CreditCard className="size-4 mr-2" /> Abrir checkout novamente
              </Button>
              <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
                <Loader2 className="size-3 animate-spin" /> Aguardando confirmação do pagamento...
              </div>
            </div>
          )}

          {paid && card && (
            <div className="text-center space-y-3 py-4">
              <CheckCircle2 className="size-12 mx-auto text-[color:var(--kpi-emerald)]" />
              <p className="font-semibold">Pagamento aprovado!</p>
              <p className="text-sm text-muted-foreground">Sua assinatura foi renovada.</p>
              <Button className="w-full" onClick={() => closeCard(false)}>Fechar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
