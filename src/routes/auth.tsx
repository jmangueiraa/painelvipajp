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
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-[image:var(--gradient-subtle)]">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="size-10 rounded-xl bg-[image:var(--gradient-primary)] flex items-center justify-center shadow-[var(--shadow-glow)]">
            <Sparkles className="size-5 text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold tracking-tight">Painel VIP</span>
        </div>

        <Card className="border-border/60 shadow-[var(--shadow-elegant)]">
          <CardHeader>
            <CardTitle>{forgotOpen ? "Recuperar senha" : "Acesse sua conta"}</CardTitle>
            <CardDescription>
              {forgotOpen
                ? "Enviaremos um link para você redefinir sua senha."
                : "Gerencie clientes, planos e cobranças Pix em um só lugar."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {forgotOpen ? (
              <form onSubmit={handleForgot} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-forgot">E-mail</Label>
                  <Input id="email-forgot" name="email" type="email" required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="size-4 animate-spin" />}
                  Enviar link de recuperação
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => setForgotOpen(false)}>
                  Voltar
                </Button>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    defaultValue="entretenimentoajp@gmail.com"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Senha</Label>
                    <button type="button" onClick={() => setForgotOpen(true)} className="text-xs text-primary hover:underline">
                      Esqueci minha senha
                    </button>
                  </div>
                  <Input id="password" name="password" type="password" required autoComplete="current-password" />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="size-4 animate-spin" />}
                  Entrar no Painel
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Ao continuar você concorda com nossos termos de uso.{" "}
          <Link to="/" className="text-primary hover:underline">Voltar</Link>
        </p>
      </div>
    </div>
  );
}
