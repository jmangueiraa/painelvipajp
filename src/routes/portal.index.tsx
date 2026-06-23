import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, MessageCircle, ShieldCheck, KeyRound, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { portalFetch, setPortalToken } from "@/lib/portal-client";
import { formatPhone } from "@/lib/format";

export const Route = createFileRoute("/portal/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Portal do Cliente" },
      { name: "description", content: "Acesse seu plano, renove e veja seus pagamentos." },
    ],
  }),
  component: PortalLoginPage,
});

function PortalLoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await portalFetch("/api/public/portal/request-otp", {
        method: "POST",
        body: JSON.stringify({ whatsapp: phone }),
      });
      toast.success("Código enviado no WhatsApp");
      setStep("code");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await portalFetch<{ token: string }>("/api/public/portal/verify-otp", {
        method: "POST",
        body: JSON.stringify({ whatsapp: phone, code }),
      });
      setPortalToken(res.token);
      navigate({ to: "/portal/painel" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loginPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await portalFetch<{ token: string }>("/api/public/portal/login-password", {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), password }),
      });
      setPortalToken(res.token);
      navigate({ to: "/portal/painel" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Portal do Cliente</CardTitle>
          <CardDescription>Escolha como quer entrar.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="whatsapp" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="whatsapp">
                <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
              </TabsTrigger>
              <TabsTrigger value="senha">
                <KeyRound className="h-4 w-4 mr-1" /> Usuário/Senha
              </TabsTrigger>
            </TabsList>

            <TabsContent value="whatsapp" className="pt-4">
              {step === "phone" ? (
                <form onSubmit={requestCode} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="whatsapp">WhatsApp</Label>
                    <div className="relative">
                      <MessageCircle className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="whatsapp"
                        inputMode="tel"
                        placeholder="(11) 99999-9999"
                        className="pl-9"
                        value={phone}
                        onChange={(e) => setPhone(formatPhone(e.target.value))}
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading || phone.replace(/\D/g, "").length < 10}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Receber código"}
                  </Button>
                </form>
              ) : (
                <form onSubmit={verify} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Código</Label>
                    <Input
                      id="code"
                      inputMode="numeric"
                      placeholder="000000"
                      maxLength={6}
                      className="text-center text-2xl tracking-[0.5em]"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={() => setStep("phone")} disabled={loading}>
                    Trocar número
                  </Button>
                </form>
              )}
            </TabsContent>

            <TabsContent value="senha" className="pt-4">
              <form onSubmit={loginPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Usuário</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="username"
                      autoComplete="username"
                      className="pl-9"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      className="pl-9"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading || username.trim().length < 3 || password.length < 4}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Peça ao seu provedor o usuário e senha do portal.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
