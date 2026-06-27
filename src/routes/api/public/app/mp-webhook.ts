import { createFileRoute } from "@tanstack/react-router";

const MP_API = "https://api.mercadopago.com/v1/payments";

function json(d: unknown, init?: ResponseInit) {
  return Response.json(d, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

export const Route = createFileRoute("/api/public/app/mp-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            data?: { id?: string | number };
            type?: string;
            action?: string;
          };
          const paymentId = body?.data?.id ? String(body.data.id) : null;
          if (!paymentId) return json({ ok: true });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
          if (!token) return json({ ok: true });

          const r = await fetch(`${MP_API}/${paymentId}`, { headers: { Authorization: `Bearer ${token}` } });
          if (!r.ok) return json({ ok: true });
          const mp = (await r.json().catch(() => ({}))) as { status?: string; external_reference?: string };

          if (!mp.external_reference) return json({ ok: true });

          const { data: req } = await supabaseAdmin
            .from("app_renewal_requests")
            .select("id,user_id,days,status")
            .eq("id", mp.external_reference)
            .maybeSingle();
          if (!req) return json({ ok: true });

          await supabaseAdmin
            .from("app_renewal_requests")
            .update({ mp_status: mp.status ?? null })
            .eq("id", req.id);


          if (mp.status === "approved" && req.status !== "paid") {
            const { data: settings } = await supabaseAdmin
              .from("settings")
              .select("subscription_expires_at")
              .eq("user_id", req.user_id)
              .maybeSingle();
            const { count: paidCount } = await supabaseAdmin
              .from("app_renewal_requests")
              .select("id", { count: "exact", head: true })
              .eq("user_id", req.user_id)
              .eq("status", "paid");
            const current = (settings as { subscription_expires_at?: string | null } | null)?.subscription_expires_at;
            const hasPaidBefore = (paidCount ?? 0) > 0;
            const base = hasPaidBefore && current && new Date(current).getTime() > Date.now()
              ? new Date(current)
              : new Date();
            base.setUTCDate(base.getUTCDate() + req.days);
            const newExpiry = base.toISOString().slice(0, 10);

            await supabaseAdmin
              .from("settings")
              .upsert({ user_id: req.user_id, subscription_expires_at: newExpiry }, { onConflict: "user_id" });

            await supabaseAdmin
              .from("app_renewal_requests")
              .update({ status: "paid", paid_at: new Date().toISOString() })
              .eq("id", req.id);
          }

          return json({ ok: true });
        } catch (e) {
          return json({ ok: false, error: (e as Error).message }, { status: 200 });
        }
      },
    },
  },
});
