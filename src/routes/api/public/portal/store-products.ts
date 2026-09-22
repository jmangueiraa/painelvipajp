import { createFileRoute } from "@tanstack/react-router";
import { portalCorsHeaders, portalOptions } from "@/lib/portal-cors";

function json(data: unknown, request: Request, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...portalCorsHeaders(request), ...(init?.headers ?? {}) } });
}

export const Route = createFileRoute("/api/public/portal/store-products")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => portalOptions(request),
      GET: async ({ request }) => {
        try {
          const portal = await import("@/integrations/portal/session.server");
          const client = await portal.getSessionFromRequest(request).catch(() => null);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 1. Tenta buscar via RPC SECURITY DEFINER (bypassa qualquer bloqueio de RLS)
          try {
            const { data: rpcProds, error: rpcErr } = await (supabaseAdmin.rpc as any)("portal_get_store_products");
            if (!rpcErr && Array.isArray(rpcProds) && rpcProds.length > 0) {
              return json({ products: rpcProds }, request);
            }
          } catch {}

          let targetUserId = client?.user_id || null;
          if (!targetUserId) {
            const { data: s } = await supabaseAdmin.from("settings").select("user_id").limit(1).maybeSingle();
            if (s?.user_id) targetUserId = s.user_id;
          }

          let data: any[] | null = null;
          let error: any = null;

          if (targetUserId) {
            const res = await supabaseAdmin
              .from("store_products")
              .select("id,key,label,sale_cents,duration_days,emoji,gradient,sort_order,image_url")
              .eq("user_id", targetUserId)
              .eq("active", true)
              .order("sort_order", { ascending: true });
            data = res.data;
            error = res.error;
          }

          // Se não encontrou produtos para targetUserId ou deu erro/vazio, busca qualquer produto ativo
          if (!data || data.length === 0) {
            const fallbackRes = await supabaseAdmin
              .from("store_products")
              .select("id,key,label,sale_cents,duration_days,emoji,gradient,sort_order,image_url")
              .eq("active", true)
              .order("sort_order", { ascending: true });
            if (!fallbackRes.error && fallbackRes.data && fallbackRes.data.length > 0) {
              data = fallbackRes.data;
              error = null;
            }
          }

          if (error) return json({ error: error.message }, request, { status: 500 });

          const products = (data ?? []).map((p) => ({
            id: p.key || p.id,
            label: p.label,
            price_cents: p.sale_cents,
            emoji: p.emoji ?? "🛒",
            gradient: p.gradient ?? "from-emerald-500 to-teal-600",
            image_url: p.image_url ?? null,
          }));
          return json({ products }, request);
        } catch (e) {
          return json({ error: (e as Error).message }, request, { status: 500 });
        }
      },
    },
  },
});
