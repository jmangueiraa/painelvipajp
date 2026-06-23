import { createFileRoute } from "@tanstack/react-router";

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

export const Route = createFileRoute("/api/public/portal/login-password")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
          const username = (body.username ?? "").trim();
          const password = body.password ?? "";
          if (username.length < 3 || password.length < 4) {
            return json({ error: "Usuário ou senha inválidos." }, { status: 400 });
          }

          const portal = await import("@/integrations/portal/session.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const client = await portal.getClientByPortalUsername(username);
          if (!client) return json({ error: "Usuário ou senha incorretos." }, { status: 401 });

          // re-fetch password hash (not in PortalClient projection)
          const { data: row } = await supabaseAdmin
            .from("clients")
            .select("portal_password_hash")
            .eq("id", client.id)
            .maybeSingle();

          if (!row?.portal_password_hash || !portal.verifyPassword(password, row.portal_password_hash)) {
            return json({ error: "Usuário ou senha incorretos." }, { status: 401 });
          }

          const token = portal.genSessionToken();
          const tokenHash = portal.sha256(token);
          const expires = new Date(Date.now() + portal.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
          await supabaseAdmin.from("portal_sessions").insert({
            client_id: client.id,
            token_hash: tokenHash,
            expires_at: expires,
          });

          return json({ token, expires_at: expires });
        } catch (e) {
          return json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
