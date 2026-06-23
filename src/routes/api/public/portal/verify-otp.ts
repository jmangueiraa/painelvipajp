import { createFileRoute } from "@tanstack/react-router";

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

export const Route = createFileRoute("/api/public/portal/verify-otp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as { whatsapp?: string; code?: string };
          const portal = await import("@/integrations/portal/session.server");
          const phone = portal.normalizePhone(body.whatsapp ?? "");
          const code = (body.code ?? "").replace(/\D/g, "");
          if (phone.length < 12 || code.length !== 6) return json({ error: "Dados inválidos." }, { status: 400 });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: otps } = await supabaseAdmin
            .from("portal_otp_codes")
            .select("*")
            .eq("whatsapp_digits", phone)
            .is("used_at", null)
            .gt("expires_at", new Date().toISOString())
            .order("created_at", { ascending: false })
            .limit(1);

          const otp = otps?.[0];
          if (!otp) return json({ error: "Código expirado. Solicite outro." }, { status: 400 });
          if (otp.attempts >= portal.OTP_MAX_ATTEMPTS) return json({ error: "Muitas tentativas. Solicite outro código." }, { status: 429 });

          const codeHash = portal.sha256(code);
          if (codeHash !== otp.code_hash) {
            await supabaseAdmin.from("portal_otp_codes").update({ attempts: otp.attempts + 1 }).eq("id", otp.id);
            return json({ error: "Código incorreto." }, { status: 400 });
          }

          await supabaseAdmin.from("portal_otp_codes").update({ used_at: new Date().toISOString() }).eq("id", otp.id);

          const client = await portal.getClientByPhone(phone);
          if (!client) return json({ error: "Cliente não encontrado." }, { status: 404 });

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
