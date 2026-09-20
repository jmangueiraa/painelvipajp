import { createFileRoute } from "@tanstack/react-router";
import { portalCorsHeaders, portalOptions } from "@/lib/portal-cors";

function json(data: unknown, request: Request, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...portalCorsHeaders(request), ...(init?.headers ?? {}) } });
}

// Taxa do cartão (Mercado Pago ~4.99% para 1x). Repassada ao cliente.
const CARD_FEE_PERCENT = 4.99;
function applyCardFee(price_cents: number) {
  return Math.ceil(price_cents / (1 - CARD_FEE_PERCENT / 100));
}

export const Route = createFileRoute("/api/public/portal/mp-create-card")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => portalOptions(request),
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            days?: number;
            amount_cents?: number;
            label?: string;
            token?: string;
            card_data?: import("@/lib/mercadopago-card.server").CardInput;
          };
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
              error: "Access Token de TESTE detectado. Use o token de PRODUÇÃO do Mercado Pago (começa com APP_USR-).",
            }, request, { status: 500 });
          }

          const days = Number(body.days);
          const base_cents = Number(body.amount_cents);
          if (!Number.isFinite(days) || days < 1 || days > 3650) return json({ error: "Período inválido" }, request, { status: 400 });
          if (!Number.isFinite(base_cents) || base_cents < 100) return json({ error: "Valor inválido" }, request, { status: 400 });

          const amount_cents = applyCardFee(base_cents);

          // Se client.user_id ainda for null, pega o primeiro user_id de settings para satisfazer a chave
          if (!client.user_id) {
            const { data: s } = await supabaseAdmin.from("settings").select("user_id").limit(1).maybeSingle();
            if (s?.user_id) client.user_id = s.user_id;
          }

          const renewalLabel = body.label ? `${body.label} - ${client.name}` : `Renovação ${days} dias - ${client.name}`;
          const { data: renewal, error: insErr } = await supabaseAdmin
            .from("renewal_requests")
            .insert({
              client_id: client.id,
              user_id: client.user_id,
              days,
              amount_cents,
              status: "awaiting_payment",
              label: renewalLabel,
            })
            .select("id")
            .single();
          if (insErr || !renewal) {
            console.error("[mp-create-card renewal_requests insert error]", insErr);
            return json({ error: "Falha ao registrar solicitação", detail: insErr?.message }, request, { status: 500 });
          }

          const url = new URL(request.url);
          const origin = `${url.protocol}//${url.host}`;
          const portalOrigin = request.headers.get("x-portal-origin") || origin;
          const back = `${portalOrigin}/portal/painel`;
          const notificationUrl = `${origin}/api/public/portal/mp-webhook?external_reference=${renewal.id}`;

          // =========================================================================
          // NOVO FLUXO: CHECKOUT DIRETO E TRANSPARENTE VIA API MERCADO PAGO
          // =========================================================================
          if (body.card_data) {
            const { detectCardBrand, createMpCardToken, createMpDirectCardPayment } = await import(
              "@/lib/mercadopago-card.server"
            );

            // 1. Gera token seguro no Mercado Pago
            const tokenRes = await createMpCardToken(token, body.card_data);
            if (!tokenRes.token) {
              await supabaseAdmin
                .from("renewal_requests")
                .update({ mp_status: "token_failed" })
                .eq("id", renewal.id);
              return json({ ok: false, error: tokenRes.error || "Dados do cartão inválidos" }, request, { status: 400 });
            }

            // 2. Cobra via POST /v1/payments
            const brand = detectCardBrand(body.card_data.card_number);
            const clientNameParts = (client.name || "Cliente VIP").trim().split(" ");
            const firstName = clientNameParts[0] || "Cliente";
            const lastName = clientNameParts.slice(1).join(" ") || "VIP";

            const paymentRes = await createMpDirectCardPayment(token, {
              cardToken: tokenRes.token,
              amountCents: amount_cents,
              description: `Renovação ${body.label ?? `${days}d`} - ${client.name}`,
              externalReference: renewal.id,
              installments: body.card_data.installments || 1,
              paymentMethodId: brand,
              payer: {
                email: `cliente.${client.id.slice(0, 8)}@painelvip.app`,
                cpf: body.card_data.cpf,
                firstName,
                lastName,
              },
              notificationUrl,
            });

            // Se aprovado na hora
            if (paymentRes.status === "approved") {
              const { finalizePaidRenewal } = await import("@/lib/portal-renewal-finalize.server");
              await finalizePaidRenewal(
                renewal.id,
                {
                  id: paymentRes.payment_id,
                  status: "approved",
                  date_approved: paymentRes.date_approved,
                  transaction_amount: paymentRes.transaction_amount,
                  payment_method_id: brand,
                  payment_type_id: "credit_card",
                  description: `Renovação ${body.label ?? `${days}d`} - ${client.name}`,
                  metadata: {
                    client_id: client.id,
                    client_name: client.name,
                    client_phone: client.phone,
                    current_due_date: client.due_date,
                    days,
                  },
                },
                {
                  id: client.id,
                  name: client.name,
                  phone: client.phone,
                  due_date: client.due_date,
                  user_id: client.user_id,
                },
              );

              return json(
                {
                  ok: true,
                  status: "approved",
                  renewal_id: renewal.id,
                  payment_id: paymentRes.payment_id,
                  amount_cents,
                  base_cents,
                  message: "Pagamento aprovado com sucesso!",
                },
                request,
              );
            }

            // Se em análise
            if (paymentRes.status === "in_process") {
              await supabaseAdmin
                .from("renewal_requests")
                .update({
                  mp_status: "in_process",
                  mp_payment_id: paymentRes.payment_id ? String(paymentRes.payment_id) : undefined,
                })
                .eq("id", renewal.id);

              return json(
                {
                  ok: true,
                  status: "in_process",
                  renewal_id: renewal.id,
                  payment_id: paymentRes.payment_id,
                  amount_cents,
                  base_cents,
                  message: paymentRes.message,
                },
                request,
              );
            }

            // Se recusado
            await supabaseAdmin
              .from("renewal_requests")
              .update({
                mp_status: paymentRes.status_detail || "rejected",
                mp_payment_id: paymentRes.payment_id ? String(paymentRes.payment_id) : undefined,
              })
              .eq("id", renewal.id);

            return json(
              {
                ok: false,
                status: "rejected",
                renewal_id: renewal.id,
                error: paymentRes.message || "Pagamento não autorizado pela operadora do cartão.",
                detail: paymentRes.status_detail,
              },
              request,
              { status: 400 },
            );
          }

          // Fallback para checkout externo se chamado sem card_data
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
              payment_methods: {
                excluded_payment_types: [{ id: "ticket" }, { id: "atm" }, { id: "bank_transfer" }],
                installments: 12,
              },
              payer: {
                email: `cliente.${client.id.slice(0, 8)}@painelvip.app`,
                first_name: client.name?.split(" ")[0] || "Cliente",
                last_name: client.name?.split(" ").slice(1).join(" ") || "VIP",
              },

              external_reference: renewal.id,
              notification_url: notificationUrl,
              back_urls: { success: back, pending: back, failure: back },
              statement_descriptor: "PAINELVIP",
            }),
          });

          const mp = (await mpRes.json().catch(() => ({}))) as {
            id?: string;
            init_point?: string;
            sandbox_init_point?: string;
            message?: string;
            error?: string;
            cause?: Array<{ code?: string | number; description?: string }>;
          };
          if (!mpRes.ok || !mp.init_point) {
            const detail =
              mp.cause?.map((c) => c.description).filter(Boolean).join("; ") ||
              mp.message ||
              mp.error ||
              mpRes.statusText;
            console.error("[mp-create-card] MP error", mpRes.status, JSON.stringify(mp));
            return json({ error: "Falha no Mercado Pago", detail }, request, { status: 502 });
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
          }, request);
        } catch (e) {
          return json({ error: (e as Error).message }, request, { status: 500 });
        }
      },
    },
  },
});
