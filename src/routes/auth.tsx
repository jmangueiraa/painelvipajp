import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { translateError } from "@/lib/translate-error";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — Painel VIP" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });
    setLoading(false);
    if (error) return toast.error("Não foi possível entrar", { description: translateError(error) });
    toast.success("Bem-vindo!");
    navigate({ to: "/dashboard" });
  }


  async function handleForgot(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(String(fd.get("email")), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error("Erro", { description: translateError(error) });
    toast.success("E-mail enviado", { description: "Verifique sua caixa de entrada para redefinir a senha." });
    setForgotOpen(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-zinc-950 text-zinc-100">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="size-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-100 shadow-sm">
            <Sparkles className="size-5" />
          </div>
          <span className="text-xl font-semibold tracking-tight text-zinc-100">Painel VIP</span>
        </div>

        <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md shadow-2xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg text-zinc-100">{forgotOpen ? "Recuperar senha" : "Acesse sua conta"}</CardTitle>
            <CardDescription className="text-xs text-zinc-400">
              {forgotOpen
                ? "Enviaremos um link para você redefinir sua senha."
                : "Gerencie clientes, planos e cobranças Pix em um só lugar."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {forgotOpen ? (
              <form onSubmit={handleForgot} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email-forgot" className="text-xs text-zinc-300">E-mail</Label>
                  <Input id="email-forgot" name="email" type="email" required className="bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-sm" />
                </div>
                <Button type="submit" className="w-full bg-white text-zinc-950 hover:bg-zinc-200 font-medium rounded-lg text-sm shadow-sm" disabled={loading}>
                  {loading && <Loader2 className="size-4 animate-spin mr-2" />}
                  Enviar link de recuperação
                </Button>
                <Button type="button" variant="ghost" className="w-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 rounded-lg text-sm" onClick={() => setForgotOpen(false)}>
                  Voltar
                </Button>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs text-zinc-300">E-mail</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    defaultValue="entretenimentoajp@gmail.com"
                    className="bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs text-zinc-300">Senha</Label>
                    <button type="button" onClick={() => setForgotOpen(true)} className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
                      Esqueci minha senha
                    </button>
                  </div>
                  <Input id="password" name="password" type="password" required autoComplete="current-password" className="bg-zinc-950/70 border-zinc-800 text-zinc-100 rounded-lg text-sm" />
                </div>
                <Button type="submit" className="w-full bg-white text-zinc-950 hover:bg-zinc-200 font-medium rounded-lg text-sm shadow-sm mt-2" disabled={loading}>
                  {loading && <Loader2 className="size-4 animate-spin mr-2" />}
                  Entrar no Painel
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-zinc-500 mt-6">
          Ao continuar você concorda com nossos termos de uso.{" "}
          <Link to="/" className="text-zinc-300 hover:text-white hover:underline transition-colors">Voltar</Link>
        </p>
      </div>
    </div>
  );
}
