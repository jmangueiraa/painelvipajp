import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Copy, Crown, Loader2, QrCode, Sparkles } from "lucide-react";

import {
  getMySubscription,
  createSubscriptionPix,
  checkSubscriptionPayment,
} from "@/lib/subscription-mp.functions";
import { translateError } from "@/lib/translate-error";
import { brl, formatDateBR, formatDateTimeBR } from "@/lib/format";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/minha-assinatura")({
  head: () => ({ meta: [{ title: "Minha assinatura — Painel VIP" }] }),
  component: MinhaAssinatura,
});

const STATUS_LABEL: Record<string, string> = {
  ativa: "Ativa",
  pendente: "Pendente",
  cancelada: "Cancelada",
  vencida: "Vencida",
  teste_gratis: "Teste grátis",
};

function MinhaAssinatura() {
  const qc = useQueryClient();
  const detailFn = useServerFn(getMySubscription);
  const createPixFn = useServerFn(createSubscriptionPix);
  const checkFn = useServerFn(checkSubscriptionPayment);

  const { data, isLoading } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => detailFn(),
  });

  const [pix, setPix] = useState<{
    payment_id: string | null;
    qr_code: string;
    qr_code_base64: string;
    amount_cents: number;
    plan_name: string;
  } | null>(null);
  const [paid, setPaid] = useState(false);

  const pixMut = useMutation({
    mutationFn: async (vars: { planId: string; planName: string }) => {
      const res = await createPixFn({ data: { planId: vars.planId } });
      return { ...res, plan_name: vars.planName };
    },
    onSuccess: (res) => {
      setPaid(false);
      setPix(res);
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  // polling do status
  useEffect(() => {
    if (!pix?.payment_id || paid) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await checkFn({ data: { paymentId: pix.payment_id! } });
        if (stop) return;
        if (r.paid) {
          setPaid(true);
          toast.success("Pagamento confirmado! Assinatura atualizada.");
          qc.invalidateQueries({ queryKey: ["my-subscription"] });
        }
      } catch {
        /* silent */
      }
    };
    const id = setInterval(tick, 4000);
    tick();
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [pix?.payment_id, paid, checkFn, qc]);

  const copyPix = async () => {
    if (!pix?.qr_code) return;
    await navigator.clipboard.writeText(pix.qr_code);
    toast.success("Código PIX copiado");
  };

  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  const sub = data.subscription;
  const activePlanId = sub?.plan_id ?? null;
  const isActive = sub?.status === "ativa" && sub.current_period_end && new Date(sub.current_period_end) > new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Minha assinatura"
        description="Gerencie sua assinatura do Painel VIP e renove via PIX no Mercado Pago."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="size-4 text-primary" /> Status atual
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <Info label="Status" value={
            <Badge variant={isActive ? "default" : "outline"}>
              {sub?.status ? STATUS_LABEL[sub.status] ?? sub.status : "Sem assinatura"}
            </Badge>
          } />
          <Info
            label="Plano atual"
            value={data.plans.find((p) => p.id === activePlanId)?.name ?? "—"}
          />
          <Info label="Valor" value={brl(sub?.price_cents ?? 0)} />
          <Info
            label="Próximo vencimento"
            value={sub?.current_period_end ? formatDateBR(sub.current_period_end) : "—"}
          />
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Sparkles className="size-4 text-primary" /> Planos disponíveis
        </h2>
        {data.plans.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhum plano ativo disponível no momento.</CardContent></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.plans.map((p) => {
              const isCurrent = p.id === activePlanId && isActive;
              return (
                <Card key={p.id} className={isCurrent ? "border-primary" : undefined}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-base">
                      <span>{p.name}</span>
                      {isCurrent && <Badge>Atual</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-2xl font-bold tabular-nums">{brl(p.price_cents)}</div>
                    <div className="text-sm text-muted-foreground">{p.duration_days} dias de acesso</div>
                    <Button
                      className="w-full"
                      disabled={pixMut.isPending}
                      onClick={() => pixMut.mutate({ planId: p.id, planName: p.name })}
                    >
                      {pixMut.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>
                          <QrCode className="size-4 mr-1" /> Pagar com PIX
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico de pagamentos</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-auto">
          {data.payments.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Nenhum pagamento registrado.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead>Referência</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDateTimeBR(p.paid_at)}</TableCell>
                    <TableCell className="tabular-nums">{brl(p.amount_cents)}</TableCell>
                    <TableCell className="capitalize">{p.method ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{p.reference ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!pix} onOpenChange={(o) => { if (!o) { setPix(null); setPaid(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{paid ? "Pagamento confirmado" : `Pagar ${pix?.plan_name ?? ""}`}</DialogTitle>
            <DialogDescription>
              {paid
                ? "Sua assinatura foi atualizada automaticamente."
                : `Escaneie o QR Code ou copie o código PIX para pagar ${brl(pix?.amount_cents ?? 0)}.`}
            </DialogDescription>
          </DialogHeader>
          {paid ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle2 className="size-12 text-emerald-500" />
              <p className="text-sm text-muted-foreground">Você já pode fechar esta janela.</p>
            </div>
          ) : pix ? (
            <div className="space-y-3">
              {pix.qr_code_base64 && (
                <div className="flex justify-center">
                  <img
                    src={`data:image/png;base64,${pix.qr_code_base64}`}
                    alt="QR Code PIX"
                    className="size-56 rounded-md border"
                  />
                </div>
              )}
              {pix.qr_code && (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Código PIX copia-e-cola</div>
                  <div className="rounded-md border bg-muted/50 p-2 text-xs break-all max-h-32 overflow-auto">
                    {pix.qr_code}
                  </div>
                  <Button variant="outline" className="w-full" onClick={copyPix}>
                    <Copy className="size-4 mr-1" /> Copiar código
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center">
                Aguardando pagamento… atualizamos automaticamente ao confirmar.
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}
