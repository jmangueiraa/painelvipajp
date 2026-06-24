import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const location = useLocation();
  const navigate = useNavigate();

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

  const expiresAt = settings?.subscription_expires_at;
  const expired = !!expiresAt && new Date(expiresAt).getTime() < Date.now();
  const onRenovacao = location.pathname.startsWith("/renovacao");

  useEffect(() => {
    if (adminLoading) return;
    if (!isAdmin && expired && !onRenovacao) {
      navigate({ to: "/renovacao", replace: true });
    }
  }, [adminLoading, isAdmin, expired, onRenovacao, navigate]);

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
