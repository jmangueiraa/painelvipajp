import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Gift, Sparkles, ArrowRight, ShieldCheck, KeyRound, Mail, User, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useServerFn } from "@tanstack/react-start";
import { getPartnerMeFn } from "@/lib/partner-portal.functions";

export const Route = createFileRoute("/parceiro/login")({
  head: () => ({ meta: [{ title: "Área do Indicador — AJP INDICA" }] }),
  component: PartnerLoginPage,
});

function PartnerLoginPage() {
  const navigate = useNavigate();
  const getPartnerMe = useServerFn(getPartnerMeFn);

  const [emailOrCode, setEmailOrCode] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const existing = localStorage.getItem("ajp_partner_id");
    if (existing) {
      navigate({ to: "/parceiro" });
    }
  }, [navigate]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const val = emailOrCode.trim();
    if (!val) return toast.error("Informe seu código de parceiro ou e-mail.");

    setLoading(true);
    try {
      const isEmail = val.includes("@");
      const partner = await getPartnerMe({
        data: isEmail ? { email: val } : { email: val }, // o server resolverá
      });

      if (!partner) throw new Error("Parceiro não encontrado. Verifique seus dados.");

      localStorage.setItem("ajp_partner_id", partner.id);
      localStorage.setItem("ajp_partner_code", partner.code);
      localStorage.setItem("ajp_partner_name", partner.name);
      localStorage.setItem("ajp_partner_email", partner.email);

      toast.success(`Bem-vindo, ${partner.name}!`);
      navigate({ to: "/parceiro" });
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível acessar a Área do Indicador.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-zinc-950 text-zinc-100 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 size-96 rounded-full bg-orange-500/10 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md z-10">
        <div className="flex flex-col items-center gap-2 mb-8 text-center">
          <div className="size-12 rounded-2xl bg-gradient-to-br from-[#FF5500] to-orange-700 flex items-center justify-center text-white shadow-lg shadow-orange-500/25">
            <Gift className="size-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            AJP INDICA
            <span className="text-xs font-semibold py-0.5 px-2 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30">
              Parceiros
            </span>
          </h1>
          <p className="text-xs text-zinc-400">
            Área exclusiva para acompanhamento de indicações, comissões e repasses Pix.
          </p>
        </div>

        <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md shadow-2xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg text-zinc-100">Acesse sua conta de parceiro</CardTitle>
            <CardDescription className="text-xs text-zinc-400">
              Digite o e-mail cadastrado pelo administrador para entrar no seu painel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ident" className="text-xs text-zinc-300">
                  E-mail do Indicador
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
                  <Input
                    id="ident"
                    value={emailOrCode}
                    onChange={(e) => setEmailOrCode(e.target.value)}
                    placeholder="seuemail@exemplo.com"
                    required
                    className="pl-9 bg-zinc-950/70 border-zinc-800 text-zinc-100 text-sm"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#FF5500] hover:bg-[#E04B00] text-white font-bold text-sm shadow-md shadow-orange-500/20"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Validando acesso...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Acessar Painel do Indicador
                    <ArrowRight className="size-4" />
                  </span>
                )}
              </Button>

              <div className="pt-2 text-center">
                <p className="text-[11px] text-zinc-500">
                  Ainda não é um indicador parceiro?{" "}
                  <a
                    href="https://wa.me/5519981356505?text=Olá,%20gostaria%20de%20me%20tornar%20um%20parceiro%20do%20AJP%20INDICA"
                    target="_blank"
                    rel="noreferrer"
                    className="text-orange-400 hover:underline font-semibold"
                  >
                    Fale com o suporte
                  </a>
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
