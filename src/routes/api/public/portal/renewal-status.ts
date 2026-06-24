import { createFileRoute } from "@tanstack/react-router";

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

export const Route = createFileRoute("/api/public/portal/renewal-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const portal = await import("@/integrations/portal/session.server");
          const client = await portal.getSessionFromRequest(request);
          if (!client) return json({ error: "Sessão inválida" }, { status: 401 });

          const url = new URL(request.url);
          const id = url.searchParams.get("id");
          if (!id) return json({ error: "id obrigatório" }, { status: 400 });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: r } = await supabaseAdmin
            .from("renewal_requests")
            .select("id, mp_status, status, mp_payment_id, paid_at")
            .eq("id", id)
            .eq("client_id", client.id)
            .maybeSingle();

          if (!r) return json({ error: "Não encontrado" }, { status: 404 });
          let row = r as { mp_status: string | null; status: string | null; mp_payment_id: string | null; paid_at: string | null };

          // Fallback: se ainda não confirmado e existe mp_payment_id, consulta o MP diretamente
          // (caso o webhook não tenha chegado) e atualiza o registro.
          if (row.status !== "paid" && row.mp_status !== "approved" && row.mp_payment_id) {
            const { data: ownerSettings } = await supabaseAdmin
              .from("settings")
              .select("mp_access_token")
              .eq("user_id", client.user_id)
              .maybeSingle();
            const token = (ownerSettings as { mp_access_token?: string | null } | null)?.mp_access_token?.trim();
            if (token) {
              const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${row.mp_payment_id}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (mpRes.ok) {
                const payment = (await mpRes.json()) as { status?: string; date_approved?: string | null };
                const isApproved = payment.status === "approved";
                if (payment.status && payment.status !== row.mp_status) {
                  await supabaseAdmin
                    .from("renewal_requests")
                    .update({
                      mp_status: payment.status,
                      paid_at: isApproved ? (payment.date_approved ?? new Date().toISOString()) : row.paid_at,
                      status: isApproved ? "paid" : row.status ?? "awaiting_payment",
                    })
                    .eq("id", id);
                  row = {
                    ...row,
                    mp_status: payment.status,
                    paid_at: isApproved ? (payment.date_approved ?? new Date().toISOString()) : row.paid_at,
                    status: isApproved ? "paid" : row.status,
                  };
                }
              }
            }
          }

          return json({
            status: row.mp_status ?? "pending",
            paid: row.status === "paid" || row.mp_status === "approved",
            paid_at: row.paid_at,
          });
        } catch (e) {
          return json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
