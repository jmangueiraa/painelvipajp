import { createFileRoute } from "@tanstack/react-router";
import { portalCorsHeaders, portalOptions } from "@/lib/portal-cors";

function json(data: unknown, request: Request, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...portalCorsHeaders(request), ...(init?.headers ?? {}) } });
}

export const Route = createFileRoute("/api/public/portal/login-password")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => portalOptions(request),
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
          const username = (body.username ?? "").trim();
          const password = (body.password ?? "").trim();
          if (username.length < 1 || password.length < 1) {
            return json({ error: "Informe login e senha." }, request, { status: 400 });
          }

          const portal = await import("@/integrations/portal/session.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const normalize = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
          const onlyDigits = (value: string) => value.replace(/\D/g, "");
          const usernameLower = normalize(username);
          const usernameDigits = onlyDigits(username);

          // Aceita usuário do portal, login IPTV ou telefone do cliente.
          // Muitos cadastros antigos não possuem portal_username/portal_password_hash,
          // então a validação precisa cair para login/senha IPTV.
          const { data: rows, error } = await supabaseAdmin
            .from("clients")
            .select("id,phone,portal_username,portal_password_hash,iptv_login,iptv_password")
            .limit(1000);
          if (error) return json({ error: "Falha ao consultar." }, request, { status: 500 });

          const match = (rows ?? []).find((r) => {
            const portalUserMatches = normalize(r.portal_username) === usernameLower;
            const iptvUserMatches = normalize(r.iptv_login) === usernameLower;
            const phoneDigits = onlyDigits(r.phone ?? "");
            const phoneMatches = usernameDigits.length >= 8 && phoneDigits.endsWith(usernameDigits.slice(-8));
            const portalPasswordMatches = portal.verifyPassword(password, r.portal_password_hash);
            const iptvPasswordMatches = (r.iptv_password ?? "").trim() === password;

            return (portalUserMatches || iptvUserMatches || phoneMatches) && (portalPasswordMatches || iptvPasswordMatches);
          });
          if (!match) return json({ error: "Login ou senha incorretos." }, request, { status: 401 });

          const token = portal.genSessionToken();
          const tokenHash = portal.sha256(token);
          const expires = new Date(Date.now() + portal.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
          await supabaseAdmin.from("portal_sessions").insert({
            client_id: match.id,
            token_hash: tokenHash,
            expires_at: expires,
          });

          return json({ token, expires_at: expires }, request);
        } catch (e) {
          return json({ error: (e as Error).message }, request, { status: 500 });
        }
      },
    },
  },
});
