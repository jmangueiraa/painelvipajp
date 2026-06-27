import { createFileRoute } from "@tanstack/react-router";
import { portalCorsHeaders, portalOptions } from "@/lib/portal-cors";

function json(data: unknown, request: Request, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...portalCorsHeaders(request), ...(init?.headers ?? {}) } });
}

export const Route = createFileRoute("/api/public/portal/renew-request")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => portalOptions(request),
      POST: async ({ request }) => {
        try {
          const portal = await import("@/integrations/portal/session.server");
          const client = await portal.getSessionFromRequest(request);
          if (!client) return json({ error: "Sessão inválida" }, request, { status: 401 });

          const body = (await request.json().catch(() => ({}))) as { days?: number };
          const days = Number(body.days);
          if (!Number.isFinite(days) || days < 1 || days > 3650) return json({ error: "Período inválido" }, request, { status: 400 });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.from("renewal_requests").insert({
            client_id: client.id,
            user_id: client.user_id,
            days,
          });
          if (error) return json({ error: "Falha ao registrar solicitação" }, request, { status: 500 });

          // Notifica o dono via WhatsApp (best-effort)
          try {
            const { data: owner } = await supabaseAdmin.from("settings").select("*").eq("user_id", client.user_id).maybeSingle();
            void owner;
            const instance = process.env.Z_API_INSTANCE_ID;
            const token = process.env.Z_API_TOKEN;
            if (instance && token) {
              const headers: Record<string, string> = { "Content-Type": "application/json" };
              if (process.env.Z_API_CLIENT_TOKEN) headers["Client-Token"] = process.env.Z_API_CLIENT_TOKEN;
              // sem telefone do dono: pula
            }
          } catch { /* noop */ }

          return json({ ok: true }, request);
        } catch (e) {
          return json({ error: (e as Error).message }, request, { status: 500 });
        }
      },
    },
  },
});
