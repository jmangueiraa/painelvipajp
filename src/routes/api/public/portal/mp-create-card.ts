import { createFileRoute } from "@tanstack/react-router";

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

// Taxa do cartão (Mercado Pago ~4.99% para 1x). Repassada ao cliente.
const CARD_FEE_PERCENT = 4.99;
function applyCardFee(price_cents: number) {
  return Math.ceil(price_cents / (1 - CARD_FEE_PERCENT / 100));
}

export const Route = createFileRoute("/api/public/portal/mp-create-card")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const portal = await import("@/integrations/portal/session.server");
          const client = await portal.getSessionFromRequest(request);
          if (!client) return json({ error: "Sessão inválida" }, { status: 401 });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: ownerSettings } = await supabaseAdmin
            .from("settings")
            .select("mp_access_token")
            .eq("user_id", client.user_id)
            .maybeSingle();
          const token = (ownerSettings as { mp_access_token?: string | null } | null)?.mp_access_token?.trim();
          if (!token) return json({ error: "Mercado Pago não configurado pelo administrador" }, { status: 500 });
          if (token.startsWith("TEST-")) {
            return json({
              error: "Access Token de TESTE detectado. Use o token de PRODUÇÃO do Mercado Pago (começa com APP_USR-).",
            }, { status: 500 });
          }

          const body = (await request.json().catch(() => ({}))) as { days?: number; amount_cents?: number; label?: string };
          const days = Number(body.days);
          const base_cents = Number(body.amount_cents);
          if (!Number.isFinite(days) || days < 1 || days > 3650) return json({ error: "Período inválido" }, { status: 400 });
          if (!Number.isFinite(base_cents) || base_cents < 100) return json({ error: "Valor inválido" }, { status: 400 });

          const amount_cents = applyCardFee(base_cents);

          const { data: renewal, error: insErr } = await supabaseAdmin
            .from("renewal_requests")
            .insert({ client_id: client.id, user_id: client.user_id, days, amount_cents, status: "awaiting_payment" })
            .select("id")
            .single();
          if (insErr || !renewal) return json({ error: "Falha ao registrar solicitação" }, { status: 500 });

          const url = new URL(request.url);
          const origin = `${url.protocol}//${url.host}`;
          const back = `${origin}/portal/painel`;

          const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
              "X-Idempotency-Key": renewal.id,
            },
            body: JSON.stringify({
              items: [
                {
                  id: renewal.id,
                  title: `Renovação ${body.label ?? `${days}d`} - ${client.name}`,
                  description: `${days} dias de assinatura`,
                  quantity: 1,
                  currency_id: "BRL",
                  unit_price: Number((amount_cents / 100).toFixed(2)),
                },
              ],
              payer: {
                name: client.name?.split(" ")[0] || "Cliente",
                surname: client.name?.split(" ").slice(1).join(" ") || "VIP",
                email: `cliente.${client.id.slice(0, 8)}@painelvip.app`,
              },
              payment_methods: {
                excluded_payment_types: [{ id: "ticket" }, { id: "atm" }, { id: "bank_transfer" }],
                installments: 12,
              },
              external_reference: renewal.id,
              notification_url: `${origin}/api/public/portal/mp-webhook?external_reference=${renewal.id}`,
              back_urls: { success: back, pending: back, failure: back },
              auto_return: "approved",
              statement_descriptor: "PAINEL VIP",
            }),
          });

          const mp = (await mpRes.json().catch(() => ({}))) as {
            id?: string;
            init_point?: string;
            sandbox_init_point?: string;
            message?: string;
          };
          if (!mpRes.ok || !mp.init_point) {
            return json({ error: "Falha no Mercado Pago", detail: mp.message ?? mpRes.statusText }, { status: 502 });
          }

          await supabaseAdmin
            .from("renewal_requests")
            .update({ mp_status: "pending" })
            .eq("id", renewal.id);

          return json({
            ok: true,
            renewal_id: renewal.id,
            init_point: mp.init_point,
            amount_cents,
            base_cents,
          });
        } catch (e) {
          return json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
