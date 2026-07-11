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
      window.location.assign(res.init_point);
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

      {isAdmin && <AdminSubscriptionSection />}
      {isAdmin && <AdminRenewalPlansSection />}

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
                Abra o checkout seguro do Mercado Pago e conclua o pagamento. Ao retornar, esta tela será atualizada
                automaticamente quando aprovarmos.
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
                onClick={() => window.location.assign(card.init_point)}
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

function AdminSubscriptionSection() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["settings", user?.id, "admin-renovacao"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("subscription_expires_at,subscription_monthly_cents")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [subExpires, setSubExpires] = useState("");
  const [subMonthly, setSubMonthly] = useState("");

  useEffect(() => {
    if (settings) {
      setSubExpires(settings.subscription_expires_at ?? "");
      setSubMonthly(((settings.subscription_monthly_cents ?? 0) / 100).toFixed(2).replace(".", ","));
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sem sessão");
      const { error } = await supabase
        .from("settings")
        .update({
          subscription_expires_at: subExpires || null,
          subscription_monthly_cents: parseBrlToCents(subMonthly),
        })
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assinatura salva");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div
          className="size-10 rounded-xl grid place-items-center shrink-0"
          style={{
            background: "color-mix(in oklab, var(--kpi-violet) 15%, transparent)",
            color: "var(--kpi-violet)",
            border: "1px solid color-mix(in oklab, var(--kpi-violet) 45%, transparent)",
          }}
        >
          <KeyRound className="size-5" />
        </div>
        <div className="min-w-0">
          <CardTitle>Assinatura do painel</CardTitle>
          <CardDescription>Usado em Dashboard e Renovação (apenas administrador)</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Expira em</Label>
            <Input type="date" value={subExpires} onChange={(e) => setSubExpires(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Valor mensal (R$)</Label>
            <Input inputMode="decimal" value={subMonthly} onChange={(e) => setSubMonthly(e.target.value)} />
          </div>
        </div>
        <Button className="btn-premium rounded-full" onClick={() => save.mutate()} disabled={save.isPending}>
          Salvar assinatura
        </Button>
      </CardContent>
    </Card>
  );
}

type AppPlanRow = {
  id: string;
  name: string;
  price_cents: number;
  duration_days: number;
  active: boolean;
  featured: boolean;
};

function AdminRenewalPlansSection() {
  const qc = useQueryClient();
  const { data: plans = [] } = useQuery({
    queryKey: ["app_plans", "admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_plans")
        .select("id,name,price_cents,duration_days,active,featured")
        .order("duration_days", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AppPlanRow[];
    },
  });

  const [drafts, setDrafts] = useState<Record<string, { name: string; price: string; days: string; active: boolean; featured: boolean }>>({});
  useEffect(() => {
    const next: typeof drafts = {};
    for (const p of plans) {
      next[p.id] = {
        name: p.name,
        price: (p.price_cents / 100).toFixed(2).replace(".", ","),
        days: String(p.duration_days),
        active: p.active,
        featured: p.featured,
      };
    }
    setDrafts(next);
  }, [plans]);

  const save = useMutation({
    mutationFn: async (id: string) => {
      const d = drafts[id];
      if (!d) return;
      const { error } = await supabase.from("app_plans").update({
        name: d.name.trim() || "Plano",
        price_cents: parseBrlToCents(d.price),
        duration_days: Math.max(1, parseInt(d.days || "0", 10) || 0),
        active: d.active,
        featured: d.featured,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Plano salvo"); qc.invalidateQueries({ queryKey: ["app_plans"] }); },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("app_plans").insert({
        name: "Novo plano", price_cents: 0, duration_days: 30, active: true, featured: false,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Plano criado"); qc.invalidateQueries({ queryKey: ["app_plans"] }); },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("app_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Plano removido"); qc.invalidateQueries({ queryKey: ["app_plans"] }); },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div
          className="size-10 rounded-xl grid place-items-center shrink-0"
          style={{
            background: "color-mix(in oklab, var(--kpi-emerald) 15%, transparent)",
            color: "var(--kpi-emerald)",
            border: "1px solid color-mix(in oklab, var(--kpi-emerald) 45%, transparent)",
          }}
        >
          <CalendarClock className="size-5" />
        </div>
        <div className="min-w-0">
          <CardTitle>Planos de renovação</CardTitle>
          <CardDescription>Configure os valores e a quantidade de dias dos planos que aparecem aqui (apenas administrador)</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {plans.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum plano cadastrado.</p>
        )}
        {plans.map((p) => {
          const d = drafts[p.id];
          if (!d) return null;
          return (
            <div key={p.id} className="rounded-xl border border-border bg-card/40 p-3 space-y-3">
              <div className="grid md:grid-cols-4 gap-3">
                <div className="space-y-1 md:col-span-2">
                  <Label>Nome do plano</Label>
                  <Input value={d.name} onChange={(e) => setDrafts((s) => ({ ...s, [p.id]: { ...s[p.id], name: e.target.value } }))} />
                </div>
                <div className="space-y-1">
                  <Label>Valor (R$)</Label>
                  <Input inputMode="decimal" value={d.price} onChange={(e) => setDrafts((s) => ({ ...s, [p.id]: { ...s[p.id], price: e.target.value } }))} />
                </div>
                <div className="space-y-1">
                  <Label>Dias</Label>
                  <Input inputMode="numeric" value={d.days} onChange={(e) => setDrafts((s) => ({ ...s, [p.id]: { ...s[p.id], days: e.target.value.replace(/\D/g, "") } }))} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant={d.active ? "default" : "outline"}
                    size="sm"
                    className="rounded-full"
                    onClick={() => setDrafts((s) => ({ ...s, [p.id]: { ...s[p.id], active: !s[p.id].active } }))}
                  >
                    {d.active ? "Ativo" : "Inativo"}
                  </Button>
                  <Button
                    type="button"
                    variant={d.featured ? "default" : "outline"}
                    size="sm"
                    className="rounded-full"
                    onClick={() => setDrafts((s) => ({ ...s, [p.id]: { ...s[p.id], featured: !s[p.id].featured } }))}
                  >
                    <Star className="size-3.5 mr-1" /> {d.featured ? "Destaque" : "Sem destaque"}
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="rounded-full text-rose-400 border-rose-500/40 hover:bg-rose-500/10" onClick={() => remove.mutate(p.id)} disabled={remove.isPending}>
                    <Trash2 className="size-4" />
                  </Button>
                  <Button size="sm" className="btn-premium rounded-full" onClick={() => save.mutate(p.id)} disabled={save.isPending}>
                    Salvar
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
        <Button type="button" variant="outline" className="rounded-full" onClick={() => create.mutate()} disabled={create.isPending}>
          <Plus className="size-4 mr-1" /> Adicionar plano
        </Button>
      </CardContent>
    </Card>
  );
}
