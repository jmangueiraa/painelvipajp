import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ExternalLink, Mail, MessageCircle } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateBR, formatDateTimeBR, brl } from "@/lib/format";
import { getPortalClientDetail } from "@/lib/portal-clients.functions";

export const Route = createFileRoute("/_authenticated/portal-clientes/$id")({
  head: () => ({ meta: [{ title: "Cliente — Portal dos Clientes" }] }),
  component: PortalClientDetailPage,
});

function PortalClientDetailPage() {
  const { id } = Route.useParams();
  const detail = useServerFn(getPortalClientDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["portal-client", id],
    queryFn: () => detail({ data: { id } }),
  });

  if (isLoading || !data) {
    return <div className="p-6 text-muted-foreground">Carregando…</div>;
  }

  const c = data.client as {
    id: string; name: string; email: string | null; phone: string | null; doc: string | null;
    address: string | null; due_date: string; status: string; created_at: string;
    pwa_installed_at: string | null; last_login_at: string | null; last_device: string | null;
    login_count: number | null; portal_username: string | null; iptv_login: string | null;
    notes: string | null;
    plans: { name: string } | null; servers: { name: string } | null;
  };

  const phoneDigits = (c.phone || "").replace(/\D/g, "");
  const waHref = phoneDigits ? `https://wa.me/${phoneDigits.length >= 12 ? phoneDigits : "55" + phoneDigits}` : null;
  const mailHref = c.email ? `mailto:${c.email}` : null;
  const portalHref = "/portal";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link to="/portal-clientes"><ArrowLeft className="size-4 mr-1" />Voltar</Link></Button>
      </div>
      <PageHeader
        title={c.name}
        description={c.email || c.phone || undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            {waHref && <Button asChild variant="outline" size="sm"><a href={waHref} target="_blank" rel="noreferrer"><MessageCircle className="size-4 mr-1" />WhatsApp</a></Button>}
            {mailHref && <Button asChild variant="outline" size="sm"><a href={mailHref}><Mail className="size-4 mr-1" />E-mail</a></Button>}
            <Button asChild size="sm"><a href={portalHref} target="_blank" rel="noreferrer"><ExternalLink className="size-4 mr-1" />Painel do cliente</a></Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Cadastro</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <Field label="Plano" value={c.plans?.name ?? "—"} />
            <Field label="Servidor" value={c.servers?.name ?? "—"} />
            <Field label="Status" value={<Badge variant="outline">{c.status}</Badge>} />
            <Field label="Vencimento" value={formatDateBR(c.due_date)} />
            <Field label="Cadastrado em" value={formatDateTimeBR(c.created_at)} />
            <Field label="Documento" value={c.doc || "—"} />
            <Field label="Endereço" value={c.address || "—"} />
            <Field label="Login portal" value={c.portal_username || "—"} />
            <Field label="Login IPTV" value={c.iptv_login || "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Aplicativo</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <Field label="PWA instalado em" value={c.pwa_installed_at ? formatDateTimeBR(c.pwa_installed_at) : "—"} />
            <Field label="Quantidade de logins" value={String(c.login_count ?? 0)} />
            <Field label="Último acesso" value={c.last_login_at ? formatDateTimeBR(c.last_login_at) : "—"} />
            <Field label="Último dispositivo" value={c.last_device || "—"} />
            {data.tokens[0] && (
              <>
                <Field label="Versão do app" value={data.tokens[0].app_version || "—"} />
                <Field label="Sistema" value={data.tokens[0].os || "—"} />
                <Field label="Navegador" value={data.tokens[0].browser || "—"} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Histórico de pagamentos</CardTitle></CardHeader>
        <CardContent>
          {data.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.payments.map((p: { id: string; amount_cents: number; paid_at: string; method: string | null; notes: string | null }) => (
                <li key={p.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{brl(p.amount_cents)}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.notes || p.method || "Pagamento"}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{formatDateTimeBR(p.paid_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Histórico de acessos</CardTitle></CardHeader>
        <CardContent>
          {data.accesses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum acesso registrado.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.accesses.map((a: { id: string; event: string; os: string | null; browser: string | null; ip: string | null; created_at: string }) => (
                <li key={a.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium capitalize">{a.event}</p>
                    <p className="text-xs text-muted-foreground truncate">{[a.os, a.browser, a.ip].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{formatDateTimeBR(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
