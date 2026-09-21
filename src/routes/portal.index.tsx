import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, KeyRound, User, Eye, EyeOff, LogIn } from "lucide-react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPortalToken, portalFetch, setPortalToken } from "@/lib/portal-client";
import { useRegisterPortalSW, InstallAppCard } from "@/components/portal/install-app-card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/portal/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Acesse sua conta — Portal do Cliente" },
      { name: "description", content: "Acesse seu plano, faturas e renovações." },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#FF5500" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Portal VIP" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "manifest", href: "/portal-manifest.webmanifest?v=6" },
      { rel: "apple-touch-icon", href: "/portal-icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/portal-icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/portal-icon-512.png" },
    ],
  }),
  component: PortalLoginPage,
});

function PortalLoginPage() {
  useRegisterPortalSW();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getPortalToken()) navigate({ to: "/portal/painel", replace: true });
  }, [navigate]);

  async function loginPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      let token: string | null = null;
      let lastErrorMessage = "";

      // 1. Tenta direto via Supabase RPC (autenticação ultrarrápida em ~50ms)
      try {
        const { data: rpcData, error: rpcError } = await (supabase.rpc as any)("portal_login_client", {
          _login: username.trim(),
          _password: password.trim(),
        });
        if (!rpcError && rpcData && typeof rpcData === "object") {
          const r = rpcData as { success?: boolean; token?: string; error?: string };
          if (r.success && r.token) {
            token = r.token;
          } else if (r.error) {
            lastErrorMessage = r.error;
          }
        }
      } catch (supaErr: any) {
        console.warn("[portal Supabase direct RPC error, trying API fallback]", supaErr);
      }

      // 2. Fallback via rota de API do servidor
      if (!token && !lastErrorMessage) {
        try {
          const res = await portalFetch<{ token?: string; error?: string }>("/api/public/portal/login-password", {
            method: "POST",
            body: JSON.stringify({ username: username.trim(), password: password.trim() }),
          });
          if (res?.token) {
            token = res.token;
          }
        } catch (apiErr: any) {
          lastErrorMessage = apiErr?.message || "";
        }
      }

      if (!token) {
        throw new Error(lastErrorMessage || "Login ou senha incorretos.");
      }

      setPortalToken(token);
      toast.success("Login realizado com sucesso!");
      navigate({ to: "/portal/painel" });
    } catch (err) {
      toast.error((err as Error).message || "Falha ao realizar login. Verifique seus dados.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-start bg-gradient-to-b from-[#FF5E00] via-[#FF5000] to-[#E54500] px-4 pt-2 pb-8 text-slate-800 font-sans selection:bg-orange-600 selection:text-white relative overflow-x-hidden">
      {/* Background Decorative Rings */}
      <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-white/10 pointer-events-none blur-2xl" />
      <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-orange-700/20 pointer-events-none blur-2xl" />

      {/* Imagem da Raposa (Mascote Oficial AJP - Portal do Cliente) */}
      <div className="flex flex-col items-center justify-center pt-2 sm:pt-4 mb-2 select-none z-10">
        <div className="w-56 h-56 sm:w-64 sm:h-64 md:w-72 md:h-72 max-w-[84vw] aspect-square rounded-3xl overflow-hidden shadow-2xl shadow-orange-950/25 flex items-center justify-center transition-transform hover:scale-[1.01] duration-300">
          <img
            src="/portal-mascote.jpg?v=2"
            alt="Portal do Cliente AJP"
            className="w-full h-full object-cover"
            loading="eager"
            fetchPriority="high"
          />
        </div>
        <div className="text-white text-[11px] sm:text-xs font-black tracking-widest uppercase text-center mt-3 mb-1 drop-shadow-sm flex items-center justify-center gap-2">
          <span>—</span>
          <span>AUTOATENDIMENTO &amp; CENTRAL DO ASSINANTE</span>
          <span>—</span>
        </div>
      </div>

      {/* White Card matching reference */}
      <div className="w-full max-w-[370px] sm:max-w-md bg-white rounded-3xl shadow-2xl p-6 sm:p-7 z-10 border border-white/60 animate-in fade-in zoom-in-95 duration-300">
        <div className="text-center mb-5">
          <div className="flex items-center justify-center gap-2 mb-1">
            <User className="h-6 w-6 text-[#FF5500] stroke-[2.2]" />
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Acesse sua conta
            </h2>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Digite seu Usuário cadastrado
          </p>
        </div>

        <form onSubmit={loginPassword} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username" className="text-xs font-bold text-slate-700">
              Usuário
            </Label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 stroke-[2]" />
              <Input
                id="username"
                autoComplete="username"
                placeholder="Seu usuário"
                className="pl-10 h-12 rounded-xl bg-slate-50/70 border-slate-200 text-slate-900 text-sm focus-visible:ring-2 focus-visible:ring-[#FF5500] focus-visible:border-transparent placeholder:text-slate-400"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-bold text-slate-700">
              Senha
            </Label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 stroke-[2]" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Sua senha de acesso"
                className="pl-10 pr-10 h-12 rounded-xl bg-slate-50/70 border-slate-200 text-slate-900 text-sm focus-visible:ring-2 focus-visible:ring-[#FF5500] focus-visible:border-transparent placeholder:text-slate-400"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-12 rounded-xl bg-[#FF5500] hover:bg-[#E04B00] active:scale-[0.99] text-white font-bold text-sm sm:text-base shadow-md shadow-orange-500/25 transition-all mt-3 cursor-pointer"
            disabled={loading || !username.trim() || !password.trim()}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Acessando...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <LogIn className="h-5 w-5 stroke-[2.2]" />
                Fazer login
              </span>
            )}
          </Button>

          {/* Links de Rodapé */}
          <div className="pt-3.5 border-t border-slate-100 flex flex-col items-center gap-2">
            <div className="flex items-center justify-center gap-3 text-xs text-slate-600 font-semibold">
              <a
                href="https://wa.me/5519981356505?text=Olá,%20esqueci%20minha%20senha%20do%20portal%20do%20cliente"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[#FF5500] transition-colors"
              >
                Esqueci a senha
              </a>
              <span className="text-slate-300">|</span>
              <a
                href="https://wa.me/5519981356505?text=Olá,%20gostaria%20de%20fazer%20meu%20primeiro%20acesso%20no%20portal"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[#FF5500] transition-colors"
              >
                Primeiro acesso
              </a>
            </div>

            <p className="text-[11px] text-slate-500 text-center leading-relaxed">
              Dúvidas ou suporte?{" "}
              <a
                href="https://wa.me/5519981356505?text=Olá,%20preciso%20de%20ajuda%20com%20o%20portal"
                target="_blank"
                rel="noreferrer"
                className="text-[#FF5500] font-bold hover:underline"
              >
                Fale pelo WhatsApp
              </a>
            </p>
          </div>
        </form>
      </div>

      {/* Optional Install PWA Card */}
      <div className="w-full max-w-[370px] sm:max-w-md mt-3.5 z-10">
        <InstallAppCard />
      </div>
    </div>
  );
}
