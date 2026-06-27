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

          // Try platform token first
          const platformToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
          let token: string | null = platformToken || null;
          let mp: { status?: string; external_reference?: string } = {};

          if (token) {
            const r = await fetch(`${MP_API}/${paymentId}`, { headers: { Authorization: `Bearer ${token}` } });
            if (r.ok) mp = (await r.json().catch(() => ({}))) as typeof mp;
          }

          // If platform token couldn't find payment, try each reseller token
          if (!mp.external_reference) {
            const { data: resellers } = await supabaseAdmin
              .from("settings")
              .select("mp_access_token")
              .not("mp_access_token", "is", null);
            for (const r of (resellers ?? []) as Array<{ mp_access_token: string | null }>) {
              const t = r.mp_access_token?.trim();
              if (!t) continue;
              const rr = await fetch(`${MP_API}/${paymentId}`, { headers: { Authorization: `Bearer ${t}` } });
              if (!rr.ok) continue;
              const m = (await rr.json().catch(() => ({}))) as typeof mp;
              if (m.external_reference) { mp = m; break; }
            }
          }

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
            const current = (settings as { subscription_expires_at?: string | null } | null)?.subscription_expires_at;
            const base = current && new Date(current).getTime() > Date.now() ? new Date(current) : new Date();
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
