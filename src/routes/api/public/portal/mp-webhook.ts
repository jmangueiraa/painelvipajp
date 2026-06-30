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
          const { data: ownerSettings } = await supabaseAdmin
            .from("settings")
            .select("mp_access_token")
            .eq("user_id", (renewalRaw as { user_id: string }).user_id)
            .maybeSingle();
          const token = (ownerSettings as { mp_access_token?: string | null } | null)?.mp_access_token?.trim();
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

          // Transição atômica awaiting_payment -> paid (idempotente: só uma execução vence)
          const { data: claimed } = await supabaseAdmin
            .from("renewal_requests")
            .update({
              mp_status: payment.status ?? "approved",
              paid_at: paidAtIso,
              status: "paid",
            })
            .eq("id", renewal.id)
            .neq("status", "paid")
            .select("id")
            .maybeSingle();

          if (!claimed) {
            return json({ ok: true, skipped: "already processed" });
          }

          // Para renovações (days > 0) com cliente IPTV, estende o vencimento.
          if (renewal.days > 0 && renewal.client_id) {
            const { data: clientRow } = await supabaseAdmin
              .from("clients")
              .select("id, due_date")
              .eq("id", renewal.client_id)
              .maybeSingle();

            if (clientRow) {
              const today = new Date();
              today.setUTCHours(0, 0, 0, 0);
              const current = (clientRow as { due_date: string | null }).due_date;
              const start = current ? new Date(current + "T00:00:00Z") : today;
              const next = new Date(start);
              next.setUTCDate(next.getUTCDate() + Number(renewal.days || 0));
              const newDueDate = next.toISOString().slice(0, 10);

              await supabaseAdmin
                .from("clients")
                .update({ due_date: newDueDate })
                .eq("id", renewal.client_id);
            }
          }

          const amountCents =
            renewal.amount_cents ??
            (payment.transaction_amount ? Math.round(payment.transaction_amount * 100) : 0);

          const notes = renewal.days > 0
            ? `Renovação ${renewal.days} dias - Mercado Pago (id ${payment.id})`
            : `${renewal.label ?? "Produto avulso"} - Mercado Pago (id ${payment.id})`;

          // Histórico de pagamentos (apenas para clientes IPTV)
          if (renewal.client_id) {
            const { error: payErr } = await supabaseAdmin.from("payments").insert({
              client_id: renewal.client_id,
              user_id: renewal.user_id,
              amount_cents: amountCents,
              paid_at: paidAtIso,
              method: "pix_mercadopago",
              notes,
            });
            if (payErr) console.error("[mp-webhook] payments insert failed", payErr);
          }

          // Compras da loja por comprador externo (buyer) - registra automaticamente
          if (renewal.buyer_id && renewal.days === 0 && renewal.label) {
            const { data: buyer } = await supabaseAdmin
              .from("store_buyers")
              .select("name, email")
              .eq("id", renewal.buyer_id)
              .maybeSingle();
            const b = (buyer as { name: string | null; email: string | null } | null) ?? { name: null, email: null };

            const { data: prod } = await supabaseAdmin
              .from("store_products")
              .select("id, cost_cents, duration_days")
              .eq("user_id", renewal.user_id)
              .eq("label", renewal.label)
              .maybeSingle();
            const p = (prod as { id: string; cost_cents: number; duration_days: number } | null);
            const duration = p?.duration_days ?? 30;
            const dueDate = new Date();
            dueDate.setUTCDate(dueDate.getUTCDate() + duration);

            await supabaseAdmin.from("store_purchases").insert({
              user_id: renewal.user_id,
              client_id: null,
              buyer_id: renewal.buyer_id,
              buyer_name: b.name,
              buyer_email: b.email,
              product_id: p?.id ?? null,
              label: renewal.label,
              sale_cents: amountCents,
              cost_cents: p?.cost_cents ?? 0,
              duration_days: duration,
              purchased_at: paidAtIso,
              due_date: dueDate.toISOString().slice(0, 10),
              status: "active",
              renewal_request_id: renewal.id,
            });
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
