import { createFileRoute } from "@tanstack/react-router";

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

export const Route = createFileRoute("/api/public/portal/mp-webhook")({
  server: {
    handlers: {
      GET: async () => json({ ok: true }),
      POST: async ({ request }) => {
        try {
          const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
          if (!token) return json({ error: "not configured" }, { status: 500 });

          const url = new URL(request.url);
          const body = (await request.json().catch(() => ({}))) as {
            type?: string;
            action?: string;
            data?: { id?: string | number };
          };
          const paymentId =
            body.data?.id ??
            url.searchParams.get("data.id") ??
            url.searchParams.get("id");

          if (!paymentId) return json({ ok: true, skipped: "no payment id" });

          // Busca status real do pagamento no MP (não confie no payload)
          const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!mpRes.ok) return json({ error: "mp fetch failed" }, { status: 502 });
          const payment = (await mpRes.json()) as {
            id?: number | string;
            status?: string;
            external_reference?: string;
            transaction_amount?: number;
            date_approved?: string | null;
          };

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // localiza pelo external_reference (renewal_id) ou pelo mp_payment_id
          let renewalQuery = supabaseAdmin.from("renewal_requests").select("*").limit(1);
          if (payment.external_reference) {
            renewalQuery = renewalQuery.eq("id", payment.external_reference);
          } else {
            renewalQuery = renewalQuery.eq("mp_payment_id", String(payment.id));
          }
          const { data: renewalRaw } = await renewalQuery.maybeSingle();
          if (!renewalRaw) return json({ ok: true, skipped: "not found" });
          const renewal = renewalRaw as {
            id: string;
            client_id: string;
            user_id: string;
            days: number;
            amount_cents: number | null;
            status: string;
          };

          const isApproved = payment.status === "approved";
          const alreadyPaid = renewal.status === "paid";

          await supabaseAdmin
            .from("renewal_requests")
            .update({
              mp_status: payment.status ?? "unknown",
              paid_at: isApproved ? (payment.date_approved ?? new Date().toISOString()) : null,
              status: isApproved ? "paid" : renewal.status ?? "pending",
            })
            .eq("id", renewal.id);

          // Quando aprovado pela primeira vez, adiciona os dias comprados ao vencimento do cliente
          // e registra o pagamento no histórico.
          if (isApproved && !alreadyPaid) {
            const { data: clientRow } = await supabaseAdmin
              .from("clients")
              .select("id, due_date")
              .eq("id", renewal.client_id)
              .maybeSingle();

            if (clientRow) {
              const today = new Date();
              today.setUTCHours(0, 0, 0, 0);
              const current = (clientRow as { due_date: string | null }).due_date;
              const base = current ? new Date(current + "T00:00:00Z") : today;
              const start = base.getTime() > today.getTime() ? base : today;
              const next = new Date(start);
              next.setUTCDate(next.getUTCDate() + Number(renewal.days || 0));
              const newDueDate = next.toISOString().slice(0, 10);

              await supabaseAdmin
                .from("clients")
                .update({ due_date: newDueDate })
                .eq("id", renewal.client_id);

              await supabaseAdmin.from("payments").insert({
                client_id: renewal.client_id,
                user_id: renewal.user_id,
                amount_cents: renewal.amount_cents ?? (payment.transaction_amount ? Math.round(payment.transaction_amount * 100) : 0),
                paid_at: payment.date_approved ?? new Date().toISOString(),
                method: "pix_mercadopago",
                notes: `Renovação ${renewal.days} dias (MP ${payment.id})`,
              });
            }
          }

          return json({ ok: true });
        } catch (e) {
          return json({ error: (e as Error).message }, { status: 500 });
        }
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
    },
  },
});
