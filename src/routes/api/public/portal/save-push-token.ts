import { createFileRoute } from "@tanstack/react-router";
import { portalCorsHeaders, portalOptions } from "@/lib/portal-cors";
import { parseUA } from "@/lib/ua";

function json(data: unknown, request: Request, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...portalCorsHeaders(request), ...(init?.headers ?? {}) },
  });
}

export const Route = createFileRoute("/api/public/portal/save-push-token")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => portalOptions(request),
      POST: async ({ request }) => {
        try {
          const portal = await import("@/integrations/portal/session.server");
          const client = await portal.getSessionFromRequest(request);
          if (!client) return json({ error: "Sessão inválida" }, request, { status: 401 });

          const body = (await request.json().catch(() => ({}))) as {
            token?: string;
            platform?: string;
            installed?: boolean;
            appVersion?: string;
          };
          const token = (body.token || "").trim();
          if (!token) return json({ error: "token requerido" }, request, { status: 400 });

          const ua = (body.platform || request.headers.get("user-agent") || "").slice(0, 500);
          const { os, browser } = parseUA(ua);
          const nowISO = new Date().toISOString();

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.from("push_tokens").upsert(
            {
              token,
              client_id: client.id,
              user_id: client.user_id,
              platform: ua,
              os,
              browser,
              app_version: (body.appVersion || "").slice(0, 60) || null,
              installed_at: body.installed ? nowISO : undefined,
              last_seen_at: nowISO,
            },
            { onConflict: "token" },
          );
          if (error) return json({ error: error.message }, request, { status: 500 });

          if (body.installed) {
            await supabaseAdmin
              .from("clients")
              .update({ pwa_installed_at: nowISO, last_device: `${os} · ${browser}` })
              .eq("id", client.id)
              .is("pwa_installed_at", null);
          }

          return json({ ok: true }, request);
        } catch (e) {
          return json({ error: (e as Error).message }, request, { status: 500 });
        }
      },
    },
  },
});
