import { createFileRoute } from "@tanstack/react-router";
import { portalCorsHeaders, portalOptions } from "@/lib/portal-cors";

function json(data: unknown, request: Request, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...portalCorsHeaders(request), ...(init?.headers ?? {}) } });
}

export const Route = createFileRoute("/api/public/portal/renewal-status")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => portalOptions(request),
      GET: async ({ request }) => {
        try {
          const portal = await import("@/integrations/portal/session.server");
          const client = await portal.getSessionFromRequest(request);
          if (!client) return json({ error: "Sessão inválida" }, request, { status: 401 });

          const url = new URL(request.url);
          const id = url.searchParams.get("id");
          if (!id) return json({ error: "id obrigatório" }, request, { status: 400 });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: r } = await supabaseAdmin
            .from("renewal_requests")
            .select("id, mp_status, status, mp_payment_id, paid_at")
            .eq("id", id)
            .eq("client_id", client.id)
            .maybeSingle();

          if (!r) return json({ error: "Não encontrado" }, request, { status: 404 });
          let row = r as { mp_status: string | null; status: string | null; mp_payment_id: string | null; paid_at: string | null };

          // Fallback: se ainda não confirmado e existe mp_payment_id, consulta o MP diretamente
          // (caso o webhook não tenha chegado) e atualiza o registro.
          if (row.status !== "paid" && row.mp_status !== "approved") {
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
                .select("mp_access_token")
                .not("mp_access_token", "is", null)
                .limit(1)
                .maybeSingle();
              token = anySettings?.mp_access_token?.trim() || null;
            }
            if (token) {
              let paymentId = row.mp_payment_id;
              let payment: { status?: string; date_approved?: string | null; id?: number | string } | null = null;

              if (paymentId) {
                const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (mpRes.ok) payment = await mpRes.json();
              } else {
                // Fluxo de cartão (preference): busca pagamento por external_reference
                const searchRes = await fetch(
                  `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(id)}&sort=date_created&criteria=desc&limit=1`,
                  { headers: { Authorization: `Bearer ${token}` } },
                );
                if (searchRes.ok) {
                  const search = (await searchRes.json()) as { results?: Array<{ id?: number | string; status?: string; date_approved?: string | null }> };
                  const first = search.results?.[0];
                  if (first?.id) {
                    paymentId = String(first.id);
                    payment = first;
                  }
                }
              }

              if (payment?.status) {
                const isApproved = payment.status === "approved";
                if (isApproved) {
                  const { finalizePaidRenewal } = await import("@/lib/portal-renewal-finalize.server");
                  await finalizePaidRenewal(id, {
                    id: paymentId ?? payment.id,
                    status: payment.status,
                    date_approved: payment.date_approved,
                  });
                  row = {
                    ...row,
                    mp_payment_id: paymentId ?? (payment.id ? String(payment.id) : row.mp_payment_id),
                    mp_status: payment.status,
                    paid_at: payment.date_approved ?? new Date().toISOString(),
                    status: "paid",
                  };
                } else {
                  await supabaseAdmin
                    .from("renewal_requests")
                    .update({
                      mp_payment_id: paymentId,
                      mp_status: payment.status,
                    })
                    .eq("id", id);
                  row = { ...row, mp_payment_id: paymentId, mp_status: payment.status };
                }
              }
            }
          }

          return json({
            status: row.mp_status ?? "pending",
            paid: row.status === "paid" || row.mp_status === "approved",
            paid_at: row.paid_at,
          }, request);
        } catch (e) {
          return json({ error: (e as Error).message }, request, { status: 500 });
        }
      },
    },
  },
});
