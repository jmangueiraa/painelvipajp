import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export function useIsAdmin() {
  const { user, loading: authLoading } = useAuth();
  const q = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !authLoading && !!user?.id,
    staleTime: 5 * 60_000,
    retry: 2,
    queryFn: async () => {
      const { data: rpcData, error: rpcError } = await supabase.rpc("is_current_user_admin" as never);
      if (!rpcError) return rpcData === true;

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "admin")
        .maybeSingle();
      if (error) throw error;
      return data?.role === "admin";
    },
  });
  return { isAdmin: q.data === true, loading: authLoading || (!!user && q.isLoading) };
}
