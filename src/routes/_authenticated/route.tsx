import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/auth", replace: true });
    }
  }, [authLoading, user, navigate]);

  const { data: settings } = useQuery({
    queryKey: ["settings", user?.id, "subscription-gate"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("subscription_expires_at")
        .maybeSingle();
      if (error) throw error;
      return data as { subscription_expires_at: string | null } | null;
    },
  });

  const isLifetime = !settings?.subscription_expires_at || 
    (settings?.subscription_expires_at && new Date(settings.subscription_expires_at).getFullYear() >= 2090) ||
    isAdmin ||
    user?.email === "entretenimentoajp@gmail.com";

  const expiresAt = settings?.subscription_expires_at;
  const expired = !isLifetime && !!expiresAt && new Date(expiresAt).getTime() < Date.now();
  const onRenovacao = location.pathname.startsWith("/renovacao");

  useEffect(() => {
    if (adminLoading || authLoading || !user) return;
    if (!isAdmin && expired && !onRenovacao) {
      navigate({ to: "/renovacao", replace: true });
    }
  }, [adminLoading, authLoading, user, isAdmin, expired, onRenovacao, navigate]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando painel...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground gap-4 p-4 text-center">
        <p className="text-sm text-muted-foreground">Sessão não encontrada ou expirada.</p>
        <a
          href="/auth"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Fazer Login
        </a>
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
