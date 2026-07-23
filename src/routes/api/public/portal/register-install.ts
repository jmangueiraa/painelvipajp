import { createFileRoute } from "@tanstack/react-router";
import { portalCorsHeaders, portalOptions } from "@/lib/portal-cors";
import { parseUA } from "@/lib/ua";

function json(data: unknown, request: Request, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...portalCorsHeaders(request), ...(init?.headers ?? {}) },
  });
}

export const Route = createFileRoute("/api/public/portal/register-install")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => portalOptions(request),
      POST: async ({ request }) => {
        try {
          const portal = await import("@/integrations/portal/session.server");
          const client = await portal.getSessionFromRequest(request);
          if (!client) return json({ error: "Sessão inválida" }, request, { status: 401 });

          const body = (await request.json().catch(() => ({}))) as {
            appVersion?: string;
            platform?: string;
          };
          const ua = (body.platform || request.headers.get("user-agent") || "").slice(0, 500);
          const { os, browser } = parseUA(ua);
          const nowISO = new Date().toISOString();

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("clients")
            .update({
              pwa_installed_at: nowISO,
              last_device: `${os} · ${browser}`,
            })
            .eq("id", client.id)
            .is("pwa_installed_at", null);

          // Marca tokens já existentes deste cliente como instalados
          await supabaseAdmin
            .from("push_tokens")
            .update({
              installed_at: nowISO,
              os,
              browser,
              app_version: (body.appVersion || "").slice(0, 60) || null,
            })
            .eq("client_id", client.id)
            .is("installed_at", null);

          await supabaseAdmin.from("portal_access_log").insert({
            client_id: client.id,
            user_id: client.user_id,
            os,
            browser,
            user_agent: ua,
            event: "install",
          });

          return json({ ok: true }, request);
        } catch (e) {
          return json({ error: (e as Error).message }, request, { status: 500 });
        }
      },
    },
  },
});
