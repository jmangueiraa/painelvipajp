import { createFileRoute } from "@tanstack/react-router";
import { portalCorsHeaders, portalOptions } from "@/lib/portal-cors";

function json(data: unknown, request: Request, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...portalCorsHeaders(request), ...(init?.headers ?? {}) } });
}

export const Route = createFileRoute("/api/public/portal/logout")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => portalOptions(request),
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization");
          const token = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
          if (token) {
            const portal = await import("@/integrations/portal/session.server");
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin.from("portal_sessions").delete().eq("token_hash", portal.sha256(token));
          }
          return json({ ok: true }, request);
        } catch {
          return json({ ok: true }, request);
        }
      },
    },
  },
});
