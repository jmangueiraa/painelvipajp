import { createFileRoute } from "@tanstack/react-router";

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

export const Route = createFileRoute("/api/public/portal/mp-webhook")({
  server: {
    handlers: {
      GET: async () => json({ ok: true }),
      POST: async ({ request }) => {
        const rawBody = await request.text();
        console.log("[mp-webhook] Received body:", rawBody);
        try {
          const url = new URL(request.url);
          const body = JSON.parse(rawBody) as {

            type?: string;
            action?: string;
            data?: { id?: string | number };
          };
          const paymentId =
            body.data?.id ??
            url.searchParams.get("data.id") ??
            url.searchParams.get("id") ??
            (body.type === "payment" ? body.data?.id : undefined);

          if (!paymentId) return json({ ok: true, skipped: "no payment id" });


          const externalRef =
            url.searchParams.get("external_reference") ?? undefined;



          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // localiza renovação primeiro (sem precisar do token) para descobrir o dono
          let renewalQuery = supabaseAdmin.from("renewal_requests").select("*").limit(1);
          if (externalRef) {
            renewalQuery = renewalQuery.eq("id", externalRef);
          } else {
            renewalQuery = renewalQuery.eq("mp_payment_id", String(paymentId));
          }
          const { data: renewalRaw } = await renewalQuery.maybeSingle();
          if (!renewalRaw) return json({ ok: true, skipped: "not found" });

          // Token do assinante dono da renovação
          let token: string | null = null;
          if ((renewalRaw as { user_id?: string }).user_id) {
            const { data: ownerSettings } = await supabaseAdmin
              .from("settings")
              .select("mp_access_token")
              .eq("user_id", (renewalRaw as { user_id: string }).user_id)
              .maybeSingle();
            token = (ownerSettings as { mp_access_token?: string | null } | null)?.mp_access_token?.trim() || null;
          }
          if (!token) {
            const { data: anySettings } = await supabaseAdmin
              .from("settings")
              .select("mp_access_token")
              .not("mp_access_token", "is", null)
              .limit(1)
              .maybeSingle();
            token = anySettings?.mp_access_token?.trim() || null;
          }
          if (!token) return json({ error: "not configured" }, { status: 500 });

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

          const renewal = renewalRaw as {
            id: string;
            client_id: string | null;
            user_id: string;
            days: number;
            amount_cents: number | null;
            status: string;
            label: string | null;
            buyer_id: string | null;
          };

          const isApproved = payment.status === "approved";
          const paidAtIso = payment.date_approved ?? new Date().toISOString();

          const { notify } = await import("@/lib/notifications.server");

          if (!isApproved) {
            await supabaseAdmin
              .from("renewal_requests")
              .update({ mp_status: payment.status ?? "unknown" })
              .eq("id", renewal.id);
            if (payment.status === "rejected" || payment.status === "cancelled") {
              const amt = renewal.amount_cents ?? (payment.transaction_amount ? Math.round(payment.transaction_amount * 100) : 0);
              let nome: string | null = null;
              let telefone: string | null = null;
              let email: string | null = null;
              if (renewal.client_id) {
                const { data: c } = await supabaseAdmin.from("clients").select("name,phone").eq("id", renewal.client_id).maybeSingle();
                nome = (c as { name?: string | null } | null)?.name ?? null;
                telefone = (c as { phone?: string | null } | null)?.phone ?? null;
              } else if (renewal.buyer_id) {
                const { data: b } = await supabaseAdmin.from("store_buyers").select("name,email").eq("id", renewal.buyer_id).maybeSingle();
                nome = (b as { name?: string | null } | null)?.name ?? null;
                email = (b as { email?: string | null } | null)?.email ?? null;
              }
              await notify("payment_rejected", {
                nome, telefone, email,
                plano: renewal.days > 0 ? `Renovação ${renewal.days} dias` : (renewal.label ?? "Produto avulso"),
                valor: (amt / 100).toFixed(2).replace(".", ","),
                metodo: "Mercado Pago",
                extra: `Status: ${payment.status}`,
              });
            }
            return json({ ok: true, status: payment.status });
          }

          const { finalizePaidRenewal } = await import("@/lib/portal-renewal-finalize.server");
          const result = await finalizePaidRenewal(renewal.id, {
            id: payment.id,
            status: payment.status,
            date_approved: payment.date_approved,
            transaction_amount: payment.transaction_amount,
          });
          if (!result.claimed) return json({ ok: true, skipped: result.reason });

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
