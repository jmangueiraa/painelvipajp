import { createFileRoute } from "@tanstack/react-router";

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

export const Route = createFileRoute("/api/public/portal/request-otp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as { whatsapp?: string };
          const portal = await import("@/integrations/portal/session.server");
          const phone = portal.normalizePhone(body.whatsapp ?? "");
          if (phone.length < 12) return json({ error: "Informe um número de WhatsApp válido com DDD." }, { status: 400 });

          const client = await portal.getClientByPhone(phone);
          if (!client) return json({ error: "Não encontramos seu cadastro. Fale com seu provedor." }, { status: 404 });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const code = portal.genOtp();
          const codeHash = portal.sha256(code);
          const expires = new Date(Date.now() + portal.OTP_TTL_MIN * 60 * 1000).toISOString();

          const { error: insErr } = await supabaseAdmin.from("portal_otp_codes").insert({
            whatsapp_digits: phone,
            code_hash: codeHash,
            expires_at: expires,
          });
          if (insErr) return json({ error: "Falha ao gerar código." }, { status: 500 });

          await portal.sendWhatsappOtp(phone, code, client.name);
          return json({ ok: true });
        } catch (e) {
          return json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
