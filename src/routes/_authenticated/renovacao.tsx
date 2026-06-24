import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { RefreshCw, CalendarCheck, Copy, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { brl, formatDateBR } from "@/lib/format";
import { createAppRenewalPix, checkAppRenewalStatus } from "@/lib/app-renewal.functions";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

function RenovacaoPage() {
  const { user } = useAuth();
  const createPix = useServerFn(createAppRenewalPix);
  const checkStatus = useServerFn(checkAppRenewalStatus);

  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [pix, setPix] = useState<PixData | null>(null);
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

  const monthly = data?.subscription_monthly_cents ?? 0;
  const expires = data?.subscription_expires_at;
  const days = expires ? Math.ceil((new Date(expires).getTime() - Date.now()) / 86_400_000) : null;

  async function handlePay(plan: RenewalPlan) {
    setLoadingPlanId(plan.id);
    try {
      const res = await createPix({ data: { plan_id: plan.id } });
      setPix(res);
      setPaid(false);
    } catch (e) {
      toast.error((e as Error).message || "Falha ao gerar PIX");
    } finally {
      setLoadingPlanId(null);
    }
  }

  useEffect(() => {
    if (!pix || paid) return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await checkStatus({ data: { renewal_id: pix.renewal_id } });
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
  }, [pix, paid, checkStatus, refetch]);

  function closeDialog(open: boolean) {
    if (!open) {
      setPix(null);
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
      <PageHeader title="Renovação" description="Gerencie sua assinatura e renove via Pix" />

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
              {" "}Valor mensal: <span className="font-medium text-foreground">{brl(monthly)}</span>
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
                disabled={loadingPlanId === p.id}
                onClick={() => handlePay(p)}
                className={`flex items-center justify-between rounded-xl border bg-card/60 px-4 py-4 text-left hover:bg-card transition disabled:opacity-60 ${p.featured ? "border-primary/60" : "border-border hover:border-primary/60"}`}
              >
                <span className="flex flex-col">
                  <span className="flex items-center gap-2 font-medium">
                    {loadingPlanId === p.id ? (
                      <Loader2 className="size-4 animate-spin text-primary" />
                    ) : (
                      <RefreshCw className="size-4 text-primary" />
                    )}
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

      <Dialog open={!!pix} onOpenChange={closeDialog}>
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

          {paid && (
            <div className="text-center space-y-3 py-4">
              <CheckCircle2 className="size-12 mx-auto text-[color:var(--kpi-emerald)]" />
              <p className="font-semibold">Pagamento aprovado!</p>
              <p className="text-sm text-muted-foreground">Sua assinatura foi renovada.</p>
              <Button className="w-full" onClick={() => closeDialog(false)}>Fechar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
