import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, KeyRound, User } from "lucide-react";
import portalIcon from "@/assets/portal-icon.png.asset.json";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPortalToken, portalFetch, setPortalToken } from "@/lib/portal-client";
import { useRegisterPortalSW } from "@/components/portal/install-app-card";

export const Route = createFileRoute("/portal/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Portal do Cliente" },
      { name: "description", content: "Acesse seu plano, renove e veja seus pagamentos." },
      { name: "theme-color", content: "#3B82F6" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Portal VIP" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "manifest", href: "/portal-manifest.webmanifest" },
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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getPortalToken()) navigate({ to: "/portal/painel", replace: true });
  }, [navigate]);

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
          <img
            src={portalIcon.url}
            alt="Portal do Cliente"
            className="mx-auto mb-3 h-16 w-16 object-contain"
          />

          <CardTitle className="text-2xl">Portal do Cliente</CardTitle>
          <CardDescription>Entre com seu usuário e senha.</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
