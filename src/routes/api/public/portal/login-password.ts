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
          const password = (body.password ?? "").trim();
          if (username.length < 1 || password.length < 1) {
            return json({ error: "Informe login e senha." }, { status: 400 });
          }

          const portal = await import("@/integrations/portal/session.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Busca por iptv_login (case-insensitive)
          const { data: rows, error } = await supabaseAdmin
            .from("clients")
            .select("id,iptv_login,iptv_password")
            .ilike("iptv_login", username)
            .limit(5);
          if (error) return json({ error: "Falha ao consultar." }, { status: 500 });

          const match = (rows ?? []).find(
            (r) =>
              (r.iptv_login ?? "").trim().toLowerCase() === username.toLowerCase() &&
              (r.iptv_password ?? "").trim() === password,
          );
          if (!match) return json({ error: "Login ou senha incorretos." }, { status: 401 });

          const token = portal.genSessionToken();
          const tokenHash = portal.sha256(token);
          const expires = new Date(Date.now() + portal.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
          await supabaseAdmin.from("portal_sessions").insert({
            client_id: match.id,
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
