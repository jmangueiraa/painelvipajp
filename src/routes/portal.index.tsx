import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, KeyRound, User, Eye, EyeOff, MessageCircle, HelpCircle } from "lucide-react";

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

      // 1. Tenta login via rota de API
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
        console.warn("[portal login API error, trying Supabase RPC fallback]", apiErr);
      }

      // 2. Fallback: chamada direta ao Supabase RPC (funciona mesmo com RLS ou proxy offline)
      if (!token) {
        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc("portal_login_client", {
            _login: username.trim(),
            _password: password.trim(),
          });
          if (rpcError) {
            console.warn("[portal Supabase RPC error]", rpcError);
          } else if (rpcData && typeof rpcData === "object") {
            const r = rpcData as { success?: boolean; token?: string; error?: string };
            if (r.success && r.token) {
              token = r.token;
            } else if (r.error) {
              lastErrorMessage = r.error;
            }
          }
        } catch (supaErr: any) {
          console.warn("[portal Supabase direct RPC error]", supaErr);
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
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[#FF5500] px-4 py-8 text-slate-800 font-sans selection:bg-orange-600 selection:text-white relative overflow-hidden">
      {/* Background Decorative Rings */}
      <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-white/10 pointer-events-none blur-2xl" />
      <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-orange-700/20 pointer-events-none blur-2xl" />

      {/* Brand Header */}
      <div className="w-full max-w-md flex flex-col items-center justify-center mb-6 text-center z-10">
        <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white shadow-lg mb-3">
          <span className="text-3xl font-black tracking-wider">A</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-none drop-shadow-sm">
          AJP<span className="text-orange-200">VIP</span>
        </h1>
        <p className="text-xs sm:text-sm font-medium text-white/80 mt-1 uppercase tracking-wider">
          Autoatendimento &amp; Central do Assinante
        </p>
      </div>

      {/* White Card matching Alcans Reference (Image 3) */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 sm:p-8 z-10 border border-white/50 animate-in fade-in zoom-in-95 duration-300">
        <div className="text-center mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Acesse sua conta
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Digite seu Usuário ou Telefone cadastrado
          </p>
        </div>

        <form onSubmit={loginPassword} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username" className="text-xs font-semibold text-slate-700">
              Usuário, CPF, Email ou Telefone
            </Label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="username"
                autoComplete="username"
                placeholder="Seu usuário, CPF, email ou telefone"
                className="pl-10 h-12 rounded-xl bg-slate-50 border-slate-200 text-slate-900 text-sm focus-visible:ring-2 focus-visible:ring-[#FF5500] focus-visible:border-transparent"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs font-semibold text-slate-700">
                Senha
              </Label>
            </div>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Sua senha de acesso"
                className="pl-10 pr-10 h-12 rounded-xl bg-slate-50 border-slate-200 text-slate-900 text-sm focus-visible:ring-2 focus-visible:ring-[#FF5500] focus-visible:border-transparent"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-12 rounded-xl bg-[#FF5500] hover:bg-[#E04B00] active:scale-[0.99] text-white font-bold text-sm sm:text-base shadow-md shadow-orange-500/25 transition-all mt-2 cursor-pointer"
            disabled={loading || !username.trim() || !password.trim()}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Acessando...
              </span>
            ) : (
              "Fazer login"
            )}
          </Button>

          {/* Links de Rodapé */}
          <div className="pt-3 border-t border-slate-100 flex flex-col items-center gap-2">
            <div className="flex items-center justify-center gap-2 text-xs text-slate-600 font-medium">
              <a
                href="https://wa.me/5500000000000?text=Olá,%20esqueci%20minha%20senha%20do%20portal%20do%20cliente"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[#FF5500] transition-colors"
              >
                Esqueci a senha
              </a>
              <span className="text-slate-300">|</span>
              <a
                href="https://wa.me/5500000000000?text=Olá,%20gostaria%20de%20fazer%20meu%20primeiro%20acesso%20no%20portal"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[#FF5500] transition-colors"
              >
                Primeiro acesso
              </a>
            </div>

            <p className="text-[11px] text-slate-600 text-center leading-relaxed mt-1">
              Dúvidas ou suporte? Entre em contato com seu atendente.
            </p>
          </div>
        </form>
      </div>

      {/* Optional Install PWA Card */}
      <div className="w-full max-w-md mt-4 z-10">
        <InstallAppCard />
      </div>
    </div>
  );
}
