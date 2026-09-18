import { createFileRoute } from "@tanstack/react-router";
import { portalCorsHeaders, portalOptions } from "@/lib/portal-cors";

function json(data: unknown, request: Request, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...portalCorsHeaders(request), ...(init?.headers ?? {}) } });
}

export const Route = createFileRoute("/api/public/portal/mp-create-pix")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => portalOptions(request),
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as { days?: number; amount_cents?: number; label?: string; token?: string };
          const portal = await import("@/integrations/portal/session.server");
          const client = await portal.getSessionFromRequest(request, body.token);
          if (!client) return json({ error: "Sessão inválida" }, request, { status: 401 });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Busca token do Mercado Pago nas configurações
          let token: string | null = null;
          if (client.user_id) {
            const { data: ownerSettings } = await supabaseAdmin
              .from("settings")
              .select("mp_access_token")
              .eq("user_id", client.user_id)
              .maybeSingle();
            token = (ownerSettings as { mp_access_token?: string | null } | null)?.mp_access_token?.trim() || null;
          }

          if (!token) {
            const { data: anySettings } = await supabaseAdmin
              .from("settings")
              .select("mp_access_token, user_id")
              .not("mp_access_token", "is", null)
              .limit(1)
              .maybeSingle();
            token = anySettings?.mp_access_token?.trim() || null;
            if (anySettings?.user_id && !client.user_id) {
              client.user_id = anySettings.user_id;
            }
          }

          if (!token) return json({ error: "Mercado Pago não configurado pelo administrador" }, request, { status: 500 });
          if (token.startsWith("TEST-")) {
            return json({
              error: "Access Token de TESTE detectado. Use o token de PRODUÇÃO do Mercado Pago (começa com APP_USR-) para que o PIX possa ser pago em bancos reais.",
            }, request, { status: 500 });
          }

          const days = Number(body.days);
          const amount_cents = Number(body.amount_cents);
          if (!Number.isFinite(days) || days < 1 || days > 3650) return json({ error: "Período inválido" }, request, { status: 400 });
          if (!Number.isFinite(amount_cents) || amount_cents < 100) return json({ error: "Valor inválido" }, request, { status: 400 });

          // Se client.user_id ainda for null, pega o primeiro user_id de settings para satisfazer a chave
          if (!client.user_id) {
            const { data: s } = await supabaseAdmin.from("settings").select("user_id").limit(1).maybeSingle();
            if (s?.user_id) client.user_id = s.user_id;
          }

          // Cria a solicitação
          const { data: renewal, error: insErr } = await supabaseAdmin
            .from("renewal_requests")
            .insert({ client_id: client.id, user_id: client.user_id, days, amount_cents, status: "awaiting_payment" })
            .select("id")
            .single();
          if (insErr || !renewal) {
            console.error("[mp-create-pix renewal_requests insert error]", insErr);
            return json({ error: "Falha ao registrar solicitação", detail: insErr?.message }, request, { status: 500 });
          }

          // Cria o pagamento PIX no Mercado Pago
          const amount = amount_cents / 100;
          const description = `Renovação ${body.label ?? `${days}d`} - ${client.name}`;
          const payerEmail = `cliente.${client.id.slice(0, 8)}@painelvip.app`;
          const idempotencyKey = `${renewal.id}`;
          const url = new URL(request.url);
          const origin = `${url.protocol}//${url.host}`;


          const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
              "X-Idempotency-Key": idempotencyKey,
            },
            body: JSON.stringify({
              transaction_amount: Number(amount.toFixed(2)),
              description,
              payment_method_id: "pix",
              external_reference: renewal.id,
              payer: {
                email: payerEmail,
                first_name: client.name?.split(" ")[0] || "Cliente",
                last_name: client.name?.split(" ").slice(1).join(" ") || "VIP",
                identification: { type: "CPF", number: "00000000000" }
              },
              notification_url: `${origin}/api/public/portal/mp-webhook?external_reference=${renewal.id}`,


            }),
          });

          const mp = await mpRes.json().catch(() => ({} as Record<string, unknown>));
          if (!mpRes.ok) {
            console.error("[mp-create-pix] MP API Error:", {
              status: mpRes.status,
              body: mp,
              renewal_id: renewal.id,
              client_id: client.id
            });
            return json({ error: "Falha no Mercado Pago", detail: (mp as { message?: string }).message ?? mpRes.statusText }, request, { status: 502 });
          }

          const mpData = mp as {
            id?: number | string;
            status?: string;
            point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
          };
          const qr_code = mpData.point_of_interaction?.transaction_data?.qr_code ?? "";
          const qr_code_base64 = mpData.point_of_interaction?.transaction_data?.qr_code_base64 ?? "";
          const mp_payment_id = mpData.id ? String(mpData.id) : null;

          await supabaseAdmin
            .from("renewal_requests")
            .update({
              mp_payment_id,
              mp_status: mpData.status ?? "pending",
              pix_qr_code: qr_code,
              pix_qr_base64: qr_code_base64,
            })
            .eq("id", renewal.id);

          return json({
            ok: true,
            renewal_id: renewal.id,
            payment_id: mp_payment_id,
            qr_code,
            qr_code_base64,
            amount_cents,
          }, request);
        } catch (e) {
          return json({ error: (e as Error).message }, request, { status: 500 });
        }
      },
    },
  },
});
