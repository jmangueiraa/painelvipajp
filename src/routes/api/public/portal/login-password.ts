import { createFileRoute } from "@tanstack/react-router";
import { portalCorsHeaders, portalOptions } from "@/lib/portal-cors";
import { parseUA } from "@/lib/ua";

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

          // 1. Tenta autenticar via RPC SECURITY DEFINER (ignora RLS com máxima velocidade)
          try {
            const { data: rpcRes, error: rpcError } = await (supabaseAdmin.rpc as any)("portal_login_client", {
              _login: username,
              _password: password,
            });
            if (!rpcError && rpcRes && typeof rpcRes === "object") {
              const r = rpcRes as { success?: boolean; token?: string; expires_at?: string; error?: string };
              if (r.success && r.token) {
                return json({ token: r.token, expires_at: r.expires_at }, request);
              }
              if (r.error) {
                return json({ error: r.error }, request, { status: 401 });
              }
            }
          } catch (rpcEx) {
            console.warn("[portal login rpc fallback]", rpcEx);
          }

          // 2. Fallback: busca direta no banco de dados
          const normalize = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
          const onlyDigits = (value: string) => value.replace(/\D/g, "");
          const usernameLower = normalize(username);
          const usernameDigits = onlyDigits(username);

          const { data: rows, error } = await supabaseAdmin
            .from("clients")
            .select("id,user_id,name,phone,email,doc,portal_username,portal_password_hash,iptv_login,iptv_password,login_count")
            .limit(2000);
          if (error) {
            console.error("[portal login-password error]", error);
            return json({ error: `Falha ao consultar clientes: ${error.message || "erro no banco de dados"}` }, request, { status: 500 });
          }

          if (!rows || rows.length === 0) {
            return json({
              error: "Nenhum cliente retornado do banco. Bloqueio de RLS ativo no Supabase. Execute o script SQL no Supabase para liberar o acesso.",
            }, request, { status: 401 });
          }

          const match = rows.find((r) => {
            const nameMatches = normalize(r.name) === usernameLower;
            const portalUserMatches = normalize(r.portal_username) === usernameLower;
            const iptvUserMatches = normalize(r.iptv_login) === usernameLower;
            const emailMatches = normalize(r.email) === usernameLower;
            const docDigits = onlyDigits(r.doc ?? "");
            const docMatches = usernameDigits.length >= 11 && docDigits === usernameDigits;
            const phoneDigits = onlyDigits(r.phone ?? "");
            const phoneMatches = usernameDigits.length >= 8 && phoneDigits.endsWith(usernameDigits.slice(-8));

            const userMatches = nameMatches || portalUserMatches || iptvUserMatches || emailMatches || docMatches || phoneMatches;

            const portalPasswordMatches = portal.verifyPassword(password, r.portal_password_hash);
            const iptvPasswordMatches =
              normalize(r.iptv_password) === normalize(password) ||
              (r.iptv_password ?? "").trim() === password.trim();
            const phonePasswordMatches = phoneDigits.length >= 4 && phoneDigits.endsWith(password.trim());
            const docPasswordMatches =
              docDigits.length >= 4 && (docDigits === password.trim() || docDigits.slice(0, 6) === password.trim());
            const portalPlainMatches =
              (r.portal_password_hash ?? "").trim() === password.trim() ||
              normalize(r.portal_password_hash) === normalize(password);

            const passMatches =
              portalPasswordMatches ||
              iptvPasswordMatches ||
              phonePasswordMatches ||
              docPasswordMatches ||
              portalPlainMatches;

            return userMatches && passMatches;
          });
          if (!match) return json({ error: "Login ou senha incorretos." }, request, { status: 401 });

          const token = portal.genSessionToken();
          const tokenHash = portal.sha256(token);
          const expires = new Date(Date.now() + portal.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
          const { error: sessionError } = await supabaseAdmin.from("portal_sessions").insert({
            client_id: match.id,
            token_hash: tokenHash,
            expires_at: expires,
          });
          if (sessionError) {
            console.error("[portal_sessions insert error]", sessionError);
            return json({ error: `Erro ao salvar sessão: ${sessionError.message}` }, request, { status: 500 });
          }

          // Registra acesso
          const ua = request.headers.get("user-agent") || "";
          const { os, browser } = parseUA(ua);
          const ip =
            request.headers.get("cf-connecting-ip") ||
            request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
            null;
          const nowISO = new Date().toISOString();
          await supabaseAdmin
            .from("clients")
            .update({
              login_count: (match.login_count ?? 0) + 1,
              last_login_at: nowISO,
              last_device: `${os} · ${browser}`,
            })
            .eq("id", match.id);
          await supabaseAdmin.from("portal_access_log").insert({
            client_id: match.id,
            user_id: match.user_id,
            ip,
            os,
            browser,
            user_agent: ua.slice(0, 500),
            event: "login",
          });

          return json({ token, expires_at: expires }, request);
        } catch (e) {
          return json({ error: (e as Error).message }, request, { status: 500 });
        }
      },
    },
  },
});
