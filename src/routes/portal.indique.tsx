import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ArrowLeft, Copy, Gift, MessageCircle, Share2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPortalToken, portalFetch } from "@/lib/portal-client";

export const Route = createFileRoute("/portal/indique")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Indique e ganhe — Portal do Cliente" },
      { name: "theme-color", content: "#3B82F6" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Portal VIP" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "manifest", href: "/portal-manifest.webmanifest?v=5" },
      { rel: "apple-touch-icon", href: "/portal-icon-192.png" },
    ],
  }),
  component: PortalRefer,
});

type Me = {
  client: { name: string; referral_code: string | null; bonus_days: number };
  referrals: { id: string; name: string; paid: boolean }[];
  settings: { referral_reward_days: number; referral_enabled: boolean };
};

function PortalRefer() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!getPortalToken()) navigate({ to: "/portal" });
  }, [navigate]);

  const { data } = useQuery({
    queryKey: ["portal", "me"],
    queryFn: () => portalFetch<Me>("/api/public/portal/me"),
    retry: false,
  });

  if (!data) return <div className="min-h-dvh grid place-items-center text-muted-foreground">Carregando…</div>;

  const code = data.client.referral_code ?? "";
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${baseUrl}/portal?ref=${code}`;
  const paidCount = data.referrals.filter((r) => r.paid).length;
  const message = `🎁 Use meu código *${code}* e ganhe acesso ao melhor serviço. Cadastro: ${link}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  function shareWhatsapp() {
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Indicação", text: message, url: link });
      } catch { /* noop */ }
    } else {
      shareWhatsapp();
    }
  }

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link to="/portal/painel">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div className="font-semibold">Indique e ganhe</div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <Card className="overflow-hidden border-emerald-500/30">
          <div className="bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent p-5">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                <Gift className="h-6 w-6" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Ganhe</div>
                <div className="text-2xl font-bold">{data.settings.referral_reward_days} dias grátis</div>
                <div className="text-xs text-muted-foreground">por cada amigo que pagar a 1ª mensalidade</div>
              </div>
            </div>
          </div>
          <CardContent className="space-y-3 pt-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Seu código</div>
              <div className="flex items-center justify-between rounded-xl border bg-card p-3">
                <span className="font-mono text-lg font-bold tracking-wider">{code}</span>
                <Button size="sm" variant="ghost" onClick={copy}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={shareWhatsapp} className="bg-emerald-600 hover:bg-emerald-700">
                <MessageCircle className="mr-2 h-4 w-4" />WhatsApp
              </Button>
              <Button variant="outline" onClick={share}>
                <Share2 className="mr-2 h-4 w-4" />Compartilhar
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{data.referrals.length}</div>
            <div className="text-xs text-muted-foreground">Indicados</div>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-emerald-600">{paidCount}</div>
            <div className="text-xs text-muted-foreground">Já pagaram</div>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-primary">{data.client.bonus_days}</div>
            <div className="text-xs text-muted-foreground">Dias bônus</div>
          </CardContent></Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" />Suas indicações</CardTitle>
          </CardHeader>
          <CardContent>
            {data.referrals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Você ainda não indicou ninguém. Compartilhe seu código!</p>
            ) : (
              <ul className="divide-y">
                {data.referrals.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-3">
                    <span>{r.name}</span>
                    {r.paid ? (
                      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Pagou ✓</Badge>
                    ) : (
                      <Badge variant="secondary">Aguardando 1º pagamento</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
