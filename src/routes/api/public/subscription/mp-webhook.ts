import { createFileRoute } from "@tanstack/react-router";

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

export const Route = createFileRoute("/api/public/subscription/mp-webhook")({
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

          if (payment.status !== "approved") {
            return json({ ok: true, status: payment.status });
          }
          if (!payment.external_reference?.startsWith("sub:")) {
            return json({ ok: true, skipped: "not a subscription" });
          }

          const { applyApprovedSubscriptionPayment } = await import("@/lib/subscription-mp.server");
          const res = await applyApprovedSubscriptionPayment(payment);
          return json({ ok: true, ...res });
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
