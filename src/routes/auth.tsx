import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { translateError } from "@/lib/translate-error";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — Painel VIP" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("login");
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

  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          full_name: String(fd.get("full_name")),
          company_name: String(fd.get("company_name")),
        },
      },
    });
    setLoading(false);
    if (error) return toast.error("Erro ao criar conta", { description: translateError(error) });
    try {
      const { notifyEventFn } = await import("@/lib/notifications.functions");
      await notifyEventFn({ data: {
        event: "trial",
        payload: {
          nome: String(fd.get("full_name") || ""),
          email: String(fd.get("email") || ""),
          plano: "Trial 7 dias",
          extra: `Empresa: ${String(fd.get("company_name") || "—")}`,
        },
      } });
    } catch (err) { console.error(err); }
    if (data?.session) {
      toast.success("Conta criada com sucesso! Entrando...");
      navigate({ to: "/dashboard" });
    } else {
      toast.success("Conta criada com sucesso!");
      setTab("login");
    }
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
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="login">Entrar</TabsTrigger>
                  <TabsTrigger value="signup">Criar conta</TabsTrigger>
                </TabsList>

                <TabsContent value="login" className="space-y-4 mt-6">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">E-mail</Label>
                      <Input id="email" name="email" type="email" required autoComplete="email" />
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
                      Entrar
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup" className="space-y-4 mt-6">
                  <form onSubmit={handleSignup} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="full_name">Seu nome</Label>
                      <Input id="full_name" name="full_name" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company_name">Nome da empresa (opcional)</Label>
                      <Input id="company_name" name="company_name" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email-s">E-mail</Label>
                      <Input id="email-s" name="email" type="email" required autoComplete="email" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password-s">Senha</Label>
                      <Input id="password-s" name="password" type="password" required minLength={6} autoComplete="new-password" />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading && <Loader2 className="size-4 animate-spin" />}
                      Criar conta
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
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
