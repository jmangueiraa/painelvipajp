import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, CalendarCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { brl, formatDateBR } from "@/lib/format";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/renovacao")({
  head: () => ({ meta: [{ title: "Renovação — Painel VIP" }] }),
  component: RenovacaoPage,
});

type Settings = { subscription_expires_at: string | null; subscription_monthly_cents: number };
type RenewalPlan = { id: string; name: string; price_cents: number; duration_days: number; featured: boolean };

function RenovacaoPage() {
  const { user } = useAuth();

  const { data } = useQuery({
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
                onClick={() => toast.info("Pagamento via Pix será habilitado em breve.")}
                className={`flex items-center justify-between rounded-xl border bg-card/60 px-4 py-4 text-left hover:bg-card transition ${p.featured ? "border-primary/60" : "border-border hover:border-primary/60"}`}
              >
                <span className="flex flex-col">
                  <span className="flex items-center gap-2 font-medium">
                    <RefreshCw className="size-4 text-primary" /> {p.name}
                  </span>
                  <span className="text-xs text-muted-foreground mt-0.5">{p.duration_days} dias</span>
                </span>
                <span className="text-[color:var(--kpi-emerald)] font-bold tabular-nums">{brl(p.price_cents)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
