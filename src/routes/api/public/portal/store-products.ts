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
          const client = await portal.getSessionFromRequest(request);
          if (!client) return json({ error: "Sessão inválida" }, request, { status: 401 });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("store_products")
            .select("id,key,label,sale_cents,duration_days,emoji,gradient,sort_order,image_url")
            .eq("user_id", client.user_id)
            .eq("active", true)
            .order("sort_order", { ascending: true });
          if (error) return json({ error: error.message }, request, { status: 500 });

          const products = (data ?? []).map((p) => ({
            id: p.key,
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
