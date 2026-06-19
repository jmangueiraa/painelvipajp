import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkIsAdmin } from "@/lib/admin-subscribers.functions";
import { useAuth } from "@/hooks/use-auth";

export function useIsAdmin() {
  const { user } = useAuth();
  const fn = useServerFn(checkIsAdmin);
  const q = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await fn();
      return r.isAdmin;
    },
  });
  return { isAdmin: q.data === true, loading: q.isLoading };
}
