import { createFileRoute } from "@tanstack/react-router";

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

export const Route = createFileRoute("/api/public/portal/mp-create-pix")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
          if (!token) return json({ error: "Mercado Pago não configurado" }, { status: 500 });

          const portal = await import("@/integrations/portal/session.server");
          const client = await portal.getSessionFromRequest(request);
          if (!client) return json({ error: "Sessão inválida" }, { status: 401 });

          const body = (await request.json().catch(() => ({}))) as { days?: number; amount_cents?: number; label?: string };
          const days = Number(body.days);
          const amount_cents = Number(body.amount_cents);
          if (!Number.isFinite(days) || days < 1 || days > 3650) return json({ error: "Período inválido" }, { status: 400 });
          if (!Number.isFinite(amount_cents) || amount_cents < 100) return json({ error: "Valor inválido" }, { status: 400 });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Cria a solicitação
          const { data: renewal, error: insErr } = await supabaseAdmin
            .from("renewal_requests")
            .insert({ client_id: client.id, user_id: client.user_id, days, amount_cents })
            .select("id")
            .single();
          if (insErr || !renewal) return json({ error: "Falha ao registrar solicitação" }, { status: 500 });

          // Cria o pagamento PIX no Mercado Pago
          const amount = amount_cents / 100;
          const description = `Renovação ${body.label ?? `${days}d`} - ${client.name}`;
          const payerEmail = `cliente.${client.id.slice(0, 8)}@painelvip.app`;
          const idempotencyKey = `${renewal.id}`;

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
              },
            }),
          });

          const mp = await mpRes.json().catch(() => ({} as Record<string, unknown>));
          if (!mpRes.ok) {
            return json({ error: "Falha no Mercado Pago", detail: (mp as { message?: string }).message ?? mpRes.statusText }, { status: 502 });
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
          });
        } catch (e) {
          return json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
