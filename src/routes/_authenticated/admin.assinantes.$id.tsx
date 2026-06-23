import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, ShieldCheck, Ban, CheckCircle2, Save } from "lucide-react";

import {
  getSubscriberDetail,
  updateSubscription,
  cancelSubscription,
  markAsPaid,
} from "@/lib/admin-subscribers.functions";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { translateError } from "@/lib/translate-error";
import { brl, formatDateBR, formatDateTimeBR, parseBrlToCents } from "@/lib/format";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/assinantes/$id")({
  head: () => ({ meta: [{ title: "Detalhes do assinante — Painel VIP" }] }),
  component: AssinanteDetalhe,
});

const STATUSES = ["ativa", "pendente", "cancelada", "vencida", "teste_gratis"] as const;
const METHODS = ["pix", "cartao", "boleto", "dinheiro", "manual", "outro"] as const;

const STATUS_LABEL: Record<string, string> = {
  ativa: "Ativa", pendente: "Pendente", cancelada: "Cancelada",
  vencida: "Vencida", teste_gratis: "Teste grátis",
};

function AssinanteDetalhe() {
  const { id } = Route.useParams();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const qc = useQueryClient();
  const detailFn = useServerFn(getSubscriberDetail);
  const updateFn = useServerFn(updateSubscription);
  const cancelFn = useServerFn(cancelSubscription);
  const payFn = useServerFn(markAsPaid);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "subscriber", id],
    queryFn: () => detailFn({ data: { userId: id } }),
    enabled: isAdmin,
  });

  const [statusEdit, setStatusEdit] = useState<string | null>(null);
  const [planEdit, setPlanEdit] = useState<string | null>(null);
  const [priceEdit, setPriceEdit] = useState<string>("");
  const [periodEnd, setPeriodEnd] = useState<string>("");
  const [methodEdit, setMethodEdit] = useState<string | null>(null);

  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<string>("pix");
  const [payNotes, setPayNotes] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "subscriber", id] });
    qc.invalidateQueries({ queryKey: ["admin", "subscribers"] });
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      await updateFn({
        data: {
          userId: id,
          ...(statusEdit ? { status: statusEdit as any } : {}),
          ...(planEdit !== null ? { planId: planEdit || null } : {}),
          ...(priceEdit ? { priceCents: parseBrlToCents(priceEdit) } : {}),
          ...(periodEnd ? { currentPeriodEnd: new Date(periodEnd).toISOString() } : {}),
          ...(methodEdit ? { paymentMethod: methodEdit as any } : {}),
        },
      });
    },
    onSuccess: () => { toast.success("Assinatura atualizada"); invalidate(); },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelFn({ data: { userId: id } }),
    onSuccess: () => { toast.success("Assinatura cancelada"); invalidate(); },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const payMut = useMutation({
    mutationFn: () =>
      payFn({
        data: {
          userId: id,
          amountCents: parseBrlToCents(payAmount),
          method: payMethod as any,
          notes: payNotes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Pagamento registrado");
      setPayAmount(""); setPayNotes("");
      invalidate();
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  if (adminLoading) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando…</div>;
  }
  if (!isAdmin) {
    return (
      <Card><CardContent className="py-12 text-center space-y-2">
        <ShieldCheck className="size-10 mx-auto text-muted-foreground" />
        <h2 className="text-lg font-semibold">Acesso restrito</h2>
      </CardContent></Card>
    );
  }
  if (isLoading || !data) {
    return <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  }

  const { profile, subscription, payments, auth, plans } = data;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/admin/assinantes"><ArrowLeft className="size-4 mr-1" /> Voltar</Link>
      </Button>

      <PageHeader
        title={profile?.full_name || auth.email || "Assinante"}
        description={auth.email ?? undefined}
        actions={
          <>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="default"><CheckCircle2 className="size-4 mr-1" /> Marcar como pago</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Registrar pagamento manual</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Valor</Label>
                    <Input placeholder="R$ 49,90" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                  </div>
                  <div>
                    <Label>Forma de pagamento</Label>
                    <Select value={payMethod} onValueChange={setPayMethod}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Observações</Label>
                    <Textarea value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => payMut.mutate()} disabled={payMut.isPending || !payAmount}>
                    {payMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Confirmar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive"><Ban className="size-4 mr-1" /> Cancelar assinatura</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar esta assinatura?</AlertDialogTitle>
                  <AlertDialogDescription>O status será marcado como cancelado.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => cancelMut.mutate()}>Cancelar assinatura</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Dados do usuário</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Nome" value={profile?.full_name || "—"} />
            <Row label="Empresa" value={profile?.company_name || "—"} />
            <Row label="E-mail" value={auth.email || "—"} />
            <Row label="Telefone" value={profile?.phone || auth.phone || "—"} />
            <Row label="Conta criada em" value={auth.created_at ? formatDateBR(auth.created_at) : "—"} />
            <Row label="Última atividade" value={auth.last_sign_in_at ? formatDateBR(auth.last_sign_in_at) : "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Assinatura atual</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Status" value={
              <Badge variant="outline">{subscription?.status ? STATUS_LABEL[subscription.status] : "Sem assinatura"}</Badge>
            } />
            <Row label="Plano" value={
              plans.find((p) => p.id === subscription?.plan_id)?.name ?? "—"
            } />
            <Row label="Valor" value={brl(subscription?.price_cents ?? 0)} />
            <Row label="Início" value={subscription?.started_at ? formatDateBR(subscription.started_at) : "—"} />
            <Row label="Próximo vencimento" value={subscription?.current_period_end ? formatDateBR(subscription.current_period_end) : "—"} />
            <Row label="Forma de pagamento" value={subscription?.payment_method ?? "—"} />
            {subscription?.cancelled_at && <Row label="Cancelada em" value={formatDateBR(subscription.cancelled_at)} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Editar assinatura</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Status</Label>
              <Select value={statusEdit ?? subscription?.status ?? ""} onValueChange={setStatusEdit}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Plano</Label>
              <Select value={planEdit ?? subscription?.plan_id ?? ""} onValueChange={setPlanEdit}>
                <SelectTrigger><SelectValue placeholder="Selecionar plano" /></SelectTrigger>
                <SelectContent>
                  {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {brl(p.price_cents)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input placeholder={brl(subscription?.price_cents ?? 0)} value={priceEdit} onChange={(e) => setPriceEdit(e.target.value)} />
            </div>
            <div>
              <Label>Próximo vencimento</Label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
            <div>
              <Label>Forma de pagamento</Label>
              <Select value={methodEdit ?? subscription?.payment_method ?? ""} onValueChange={setMethodEdit}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <><Save className="size-4 mr-1" /> Salvar alterações</>}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico de pagamentos</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-auto">
          {payments.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Nenhum pagamento registrado.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead>Observações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDateTimeBR(p.paid_at)}</TableCell>
                    <TableCell className="tabular-nums">{brl(p.amount_cents)}</TableCell>
                    <TableCell className="capitalize">{p.method ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.notes ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/40 py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
