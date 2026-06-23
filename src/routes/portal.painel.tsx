import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { CalendarClock, CreditCard, Gift, LogOut, RefreshCw, Server as ServerIcon, Tv, Download, Copy, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useState } from "react";
import { brl, formatDateBR } from "@/lib/format";
import { clearPortalToken, getPortalToken, portalFetch } from "@/lib/portal-client";

export const Route = createFileRoute("/portal/painel")({
  ssr: false,
  head: () => ({ meta: [{ title: "Meu Painel — Portal do Cliente" }] }),
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
    iptv_login: string | null;
    iptv_password: string | null;
    referral_code: string | null;
    bonus_days: number;
  };
  plan: { id: string; name: string; price_cents: number; duration_days: number } | null;
  server: { id: string; name: string } | null;
  payments: { id: string; amount_cents: number; paid_at: string; method: string | null }[];
  referrals: { id: string; name: string; paid: boolean }[];
  settings: { referral_reward_days: number; referral_enabled: boolean };
  plans: { id: string; name: string; price_cents: number; duration_days: number }[];
};

function statusColor(s: string) {
  if (s === "ativo") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (s === "vencido") return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
}

function PortalDashboard() {
  const navigate = useNavigate();
  const [renewOpen, setRenewOpen] = useState(false);
  const [pixPeriod, setPixPeriod] = useState<{ label: string; days: number; price_cents: number } | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const [valCopied, setValCopied] = useState(false);
  const PIX_KEY = "16997855438";

  useEffect(() => {
    if (!getPortalToken()) navigate({ to: "/portal" });
  }, [navigate]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["portal", "me"],
    queryFn: () => portalFetch<Me>("/api/public/portal/me"),
    retry: false,
  });

  useEffect(() => {
    if (error) {
      clearPortalToken();
      navigate({ to: "/portal" });
    }
  }, [error, navigate]);

  const renew = useMutation({
    mutationFn: (days: number) => portalFetch("/api/public/portal/renew-request", { method: "POST", body: JSON.stringify({ days }) }),
    onSuccess: () => {
      toast.success("Pedido enviado! Use a chave PIX abaixo para pagar.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function selectPeriod(o: { label: string; days: number; price_cents: number }) {
    setPixPeriod(o);
    renew.mutate(o.days);
  }

  async function copy(text: string, which: "pix" | "val") {
    try {
      await navigator.clipboard.writeText(text);
      if (which === "pix") { setPixCopied(true); setTimeout(() => setPixCopied(false), 2000); }
      else { setValCopied(true); setTimeout(() => setValCopied(false), 2000); }
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
        {/* Status do plano */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base">Meu plano</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{data.plan?.name ?? "Sem plano"}</p>
              </div>
              <Badge className={statusColor(data.client.status)}>{data.client.status}</Badge>
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

        {/* Credenciais IPTV */}
        {(data.client.iptv_login || data.client.iptv_password) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Tv className="h-4 w-4" />Minhas credenciais</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              {data.client.iptv_login && (
                <div className="rounded-xl border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Login</div>
                  <div className="font-mono text-sm break-all">{data.client.iptv_login}</div>
                </div>
              )}
              {data.client.iptv_password && (
                <div className="rounded-xl border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Senha</div>
                  <div className="font-mono text-sm break-all">{data.client.iptv_password}</div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

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

        {/* Histórico de pagamentos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4" />Meus pagamentos</CardTitle>
          </CardHeader>
          <CardContent>
            {data.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pagamento registrado ainda.</p>
            ) : (
              <ul className="divide-y">
                {data.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="font-medium">{brl(p.amount_cents)}</div>
                      <div className="text-xs text-muted-foreground">{formatDateBR(p.paid_at)} · {p.method ?? "—"}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => downloadReceipt(p)}>
                      <Download className="mr-1 h-3 w-3" />Comprovante
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={renewOpen} onOpenChange={(o) => { setRenewOpen(o); if (!o) { setPixPeriod(null); setPixCopied(false); setValCopied(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Renovar plano</DialogTitle>
            <DialogDescription>
              {pixPeriod ? "Pague via PIX usando a chave abaixo." : "Escolha o período. O valor é calculado conforme seu plano."}
            </DialogDescription>
          </DialogHeader>

          {!pixPeriod ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Mensal", days: 30, months: 1 },
                  { label: "Trimestral", days: 90, months: 3 },
                  { label: "Semestral", days: 180, months: 6 },
                  { label: "Anual", days: 365, months: 12 },
                ].map((o) => (
                  <Button key={o.days} variant="outline" disabled={renew.isPending} onClick={() => selectPeriod(o)}>
                    <div className="flex flex-col">
                      <span>{o.label}</span>
                      <span className="text-xs text-muted-foreground">{brl(data.client.price_cents * o.months)}</span>
                    </div>
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Seu provedor também será avisado do pedido.</p>
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border bg-card p-3">
                <div className="text-xs text-muted-foreground">Período</div>
                <div className="font-semibold">{pixPeriod.label} · {pixPeriod.days} dias</div>
              </div>

              <div className="rounded-xl border bg-card p-3">
                <div className="text-xs text-muted-foreground">Valor a pagar</div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xl font-bold">{brl(data.client.price_cents * pixPeriod.months)}</div>
                  <Button size="sm" variant="outline" onClick={() => copy(((data.client.price_cents * pixPeriod.months) / 100).toFixed(2), "val")}>
                    {valCopied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}Copiar
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-3">
                <div className="text-xs text-muted-foreground">Chave PIX (Celular)</div>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-lg font-bold tracking-wide">{PIX_KEY}</div>
                  <Button size="sm" onClick={() => copy(PIX_KEY, "pix")}>
                    {pixCopied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}Copiar
                  </Button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Após o pagamento, envie o comprovante no WhatsApp do seu provedor. A liberação é feita após a confirmação.
              </p>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setPixPeriod(null)}>Voltar</Button>
                <Button className="flex-1" onClick={() => { setRenewOpen(false); setPixPeriod(null); }}>Fechar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* refetch helper hidden */}
      <button hidden onClick={() => refetch()} />
    </div>
  );
}
