import { createFileRoute } from "@tanstack/react-router";
import { portalCorsHeaders, portalOptions } from "@/lib/portal-cors";

function json(data: unknown, request: Request, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...portalCorsHeaders(request), ...(init?.headers ?? {}) } });
}

const CARD_FEE_PERCENT = 4.99;
const applyCardFee = (c: number) => Math.ceil(c / (1 - CARD_FEE_PERCENT / 100));
type StoreProductPrice = { label: string; sale_cents: number };

export const Route = createFileRoute("/api/public/portal/mp-create-extra")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => portalOptions(request),
      POST: async ({ request }) => {
        try {
          const portal = await import("@/integrations/portal/session.server");
          const client = await portal.getSessionFromRequest(request);
          if (!client) return json({ error: "Sessão inválida" }, request, { status: 401 });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: ownerSettings } = await supabaseAdmin
            .from("settings")
            .select("mp_access_token")
            .eq("user_id", client.user_id)
            .maybeSingle();
          const token = (ownerSettings as { mp_access_token?: string | null } | null)?.mp_access_token?.trim();
          if (!token) return json({ error: "Mercado Pago não configurado pelo administrador" }, request, { status: 500 });
          if (token.startsWith("TEST-")) {
            return json({ error: "Token de TESTE. Use o token de PRODUÇÃO (APP_USR-)." }, request, { status: 500 });
          }

          const body = (await request.json().catch(() => ({}))) as {
            method?: "pix" | "card";
            product_key?: string;
            label?: string;
            amount_cents?: number;
          };
          const method = body.method;
          const requestedLabel = (body.label ?? "").trim();
          const productKey = (body.product_key ?? "").trim();
          if (method !== "pix" && method !== "card") return json({ error: "Método inválido" }, request, { status: 400 });

          let product: StoreProductPrice | null = null;
          if (productKey) {
            const { data } = await supabaseAdmin
              .from("store_products")
              .select("label,sale_cents")
              .eq("user_id", client.user_id)
              .eq("key", productKey)
              .eq("active", true)
              .maybeSingle();
            product = data as StoreProductPrice | null;
          }
          if (!product && requestedLabel) {
            const { data } = await supabaseAdmin
              .from("store_products")
              .select("label,sale_cents")
              .eq("user_id", client.user_id)
              .eq("label", requestedLabel)
              .eq("active", true)
              .maybeSingle();
            product = data as StoreProductPrice | null;
          }

          const label = product?.label ?? requestedLabel;
          const base_cents = product?.sale_cents ?? Number(body.amount_cents);
          if (!label) return json({ error: "Produto inválido" }, request, { status: 400 });
          if (!Number.isFinite(base_cents) || base_cents < 100) return json({ error: "Valor inválido" }, request, { status: 400 });

          const amount_cents = method === "card" ? applyCardFee(base_cents) : base_cents;

          const { data: renewal, error: insErr } = await supabaseAdmin
            .from("renewal_requests")
            .insert({
              client_id: client.id,
              user_id: client.user_id,
              days: 0,
              amount_cents,
              status: "awaiting_payment",
              label,
            })
            .select("id")
            .single();
          if (insErr || !renewal) return json({ error: "Falha ao registrar solicitação" }, request, { status: 500 });

          const url = new URL(request.url);
          const origin = `${url.protocol}//${url.host}`;
          const portalOrigin = request.headers.get("x-portal-origin") || origin;
          const payerEmail = `cliente.${client.id.slice(0, 8)}@painelvip.app`;
          const description = `${label} - ${client.name}`;

          if (method === "pix") {
            const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                "X-Idempotency-Key": renewal.id,
              },
              body: JSON.stringify({
                transaction_amount: Number((amount_cents / 100).toFixed(2)),
                description,
                payment_method_id: "pix",
                external_reference: renewal.id,
                payer: {
                  email: payerEmail,
                  first_name: client.name?.split(" ")[0] || "Cliente",
                  last_name: client.name?.split(" ").slice(1).join(" ") || "VIP",
                },
              }),
            });
            const mp = (await mpRes.json().catch(() => ({}))) as {
              id?: number | string;
              status?: string;
              message?: string;
              point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
            };
            if (!mpRes.ok) {
              console.error("[mp-create-extra-pix] MP API Error:", {
                status: mpRes.status,
                body: mp,
                renewal_id: renewal.id
              });
              return json({ error: "Falha no Mercado Pago", detail: mp.message ?? mpRes.statusText }, request, { status: 502 });
            }
            const qr_code = mp.point_of_interaction?.transaction_data?.qr_code ?? "";
            const qr_code_base64 = mp.point_of_interaction?.transaction_data?.qr_code_base64 ?? "";
            const mp_payment_id = mp.id ? String(mp.id) : null;
            await supabaseAdmin
              .from("renewal_requests")
              .update({ mp_payment_id, mp_status: mp.status ?? "pending", pix_qr_code: qr_code, pix_qr_base64: qr_code_base64 })
              .eq("id", renewal.id);
            return json({ ok: true, renewal_id: renewal.id, payment_id: mp_payment_id, qr_code, qr_code_base64, amount_cents }, request);
          }

          // Cartão (Checkout Pro)
          const back = `${portalOrigin}/portal/painel`;
          const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
              "X-Idempotency-Key": renewal.id,
            },
            body: JSON.stringify({
              items: [{
                id: renewal.id,
                title: description,
                quantity: 1,
                currency_id: "BRL",
                unit_price: Number((amount_cents / 100).toFixed(2)),
              }],
              payment_methods: {
                excluded_payment_types: [{ id: "ticket" }, { id: "atm" }, { id: "bank_transfer" }],
                installments: 12,
              },
              external_reference: renewal.id,
              notification_url: `${origin}/api/public/portal/mp-webhook?external_reference=${renewal.id}`,
              back_urls: { success: back, pending: back, failure: back },
              statement_descriptor: "PAINELVIP",
            }),
          });
          const mp = (await mpRes.json().catch(() => ({}))) as {
            init_point?: string;
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
            console.error("[mp-create-extra] MP error", mpRes.status, JSON.stringify(mp));
            return json({ error: "Falha no Mercado Pago", detail }, request, { status: 502 });
          }
          await supabaseAdmin.from("renewal_requests").update({ mp_status: "pending" }).eq("id", renewal.id);
          return json({ ok: true, renewal_id: renewal.id, init_point: mp.init_point, amount_cents, base_cents }, request);
        } catch (e) {
          return json({ error: (e as Error).message }, request, { status: 500 });
        }
      },
    },
  },
});
