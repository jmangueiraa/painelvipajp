import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ArrowLeft, Copy, Gift, MessageCircle, Share2, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPortalToken, portalFetch } from "@/lib/portal-client";

export const Route = createFileRoute("/portal/indique")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Indique e Ganhe — Portal do Cliente" },
      { name: "theme-color", content: "#FF5500" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Portal VIP" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "manifest", href: "/portal-manifest.webmanifest?v=6" },
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

  if (!data) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#F4F5F7] text-slate-500 font-sans">
        Carregando programa de indicações...
      </div>
    );
  }

  const code = data.client.referral_code ?? "";
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${baseUrl}/portal?ref=${code}`;
  const paidCount = data.referrals.filter((r) => r.paid).length;
  const message = `🎁 Use meu código *${code}* e ganhe acesso ao melhor entretenimento! Cadastro: ${link}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado com sucesso!");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  function shareWhatsapp() {
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Indicação AJP VIP", text: message, url: link });
      } catch {
        /* noop */
      }
    } else {
      shareWhatsapp();
    }
  }

  return (
    <div className="min-h-dvh bg-[#F4F5F7] text-slate-800 font-sans">
      <header className="sticky top-0 z-30 bg-[#FF5500] text-white shadow-md">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/portal/painel" className="text-white hover:bg-white/20 p-2 rounded-full transition">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="font-bold text-base tracking-tight">Indique e Ganhe</div>
        </div>
      </header>

      <main className="max-w-lg mx-auto w-full px-4 py-6 space-y-4">
        {/* Card Principal */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 overflow-hidden relative">
          <div className="flex items-center gap-3.5 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
              <Gift className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">Recompensa</span>
              <div className="text-xl font-black text-slate-900 leading-tight">
                Ganhe {data.settings.referral_reward_days} dias grátis
              </div>
              <span className="text-xs text-slate-500">Por cada amigo que assinar</span>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div>
              <span className="text-xs text-slate-500 font-bold mb-1.5 block">Seu código exclusivo:</span>
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 border border-slate-200 p-3">
                <span className="font-mono text-base font-black tracking-wider text-slate-900">{code}</span>
                <button
                  type="button"
                  onClick={copy}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-[#FF5500] shadow-sm hover:bg-slate-50 transition cursor-pointer"
                >
                  Copiar link
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={shareWhatsapp}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm shadow-sm transition cursor-pointer"
              >
                <MessageCircle className="h-4 w-4" />
                <span>WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={share}
                className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm shadow-sm transition cursor-pointer"
              >
                <Share2 className="h-4 w-4" />
                <span>Compartilhar</span>
              </button>
            </div>
          </div>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-slate-100">
            <div className="text-xl font-black text-slate-900">{data.referrals.length}</div>
            <div className="text-[11px] font-bold text-slate-400 uppercase mt-0.5">Indicados</div>
          </div>
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-slate-100">
            <div className="text-xl font-black text-emerald-600">{paidCount}</div>
            <div className="text-[11px] font-bold text-slate-400 uppercase mt-0.5">Ativos</div>
          </div>
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-slate-100">
            <div className="text-xl font-black text-[#FF5500]">{data.client.bonus_days}</div>
            <div className="text-[11px] font-bold text-slate-400 uppercase mt-0.5">Dias Bônus</div>
          </div>
        </div>

        {/* Lista de Indicações */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#FF5500]" />
            <h2 className="text-sm font-bold text-slate-800">Suas indicações</h2>
          </div>

          {data.referrals.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">
              Você ainda não indicou amigos. Envie seu link e comece a acumular dias grátis!
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.referrals.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2.5 text-xs">
                  <span className="font-bold text-slate-800">{r.name}</span>
                  {r.paid ? (
                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Confirmado
                    </span>
                  ) : (
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                      Aguardando adesão
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
