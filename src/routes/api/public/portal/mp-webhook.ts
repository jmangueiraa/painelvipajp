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
          const { data: renewal } = await renewalQuery.maybeSingle();
          if (!renewal) return json({ ok: true, skipped: "not found" });

          const isApproved = payment.status === "approved";
          await supabaseAdmin
            .from("renewal_requests")
            .update({
              mp_status: payment.status ?? "unknown",
              paid_at: isApproved ? (payment.date_approved ?? new Date().toISOString()) : null,
              status: isApproved ? "paid" : (renewal as { status?: string }).status ?? "pending",
            })
            .eq("id", (renewal as { id: string }).id);

          // Best-effort: notifica o admin via Z-API quando aprovado
          if (isApproved) {
            try {
              const r = renewal as { user_id: string; client_id: string; days: number; amount_cents: number | null };
              const { data: ownerSettings } = await supabaseAdmin
                .from("settings")
                .select("notify_phone")
                .eq("user_id", r.user_id)
                .maybeSingle();
              const { data: c } = await supabaseAdmin
                .from("clients")
                .select("name, phone")
                .eq("id", r.client_id)
                .maybeSingle();
              const phone = (ownerSettings as { notify_phone?: string } | null)?.notify_phone;
              const instance = process.env.Z_API_INSTANCE_ID;
              const zToken = process.env.Z_API_TOKEN;
              if (phone && instance && zToken) {
                const headers: Record<string, string> = { "Content-Type": "application/json" };
                if (process.env.Z_API_CLIENT_TOKEN) headers["Client-Token"] = process.env.Z_API_CLIENT_TOKEN;
                const amount = ((r.amount_cents ?? 0) / 100).toFixed(2);
                const msg = `✅ Pagamento PIX aprovado!\nCliente: ${(c as { name?: string } | null)?.name ?? "—"}\nTel: ${(c as { phone?: string } | null)?.phone ?? "—"}\nPeríodo: ${r.days} dias\nValor: R$ ${amount}`;
                await fetch(`https://api.z-api.io/instances/${instance}/token/${zToken}/send-text`, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ phone: phone.replace(/\D/g, ""), message: msg }),
                }).catch(() => undefined);
              }
            } catch { /* noop */ }
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
