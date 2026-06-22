import { createFileRoute } from "@tanstack/react-router";

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

export const Route = createFileRoute("/api/public/portal/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const portal = await import("@/integrations/portal/session.server");
          const client = await portal.getSessionFromRequest(request);
          if (!client) return json({ error: "Sessão inválida" }, { status: 401 });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const [{ data: payments }, { data: plan }, { data: server }, { data: referrals }, { data: settings }] = await Promise.all([
            supabaseAdmin.from("payments").select("id,amount_cents,paid_at,method").eq("client_id", client.id).order("paid_at", { ascending: false }).limit(50),
            client.plan_id ? supabaseAdmin.from("plans").select("id,name,price_cents,duration_days").eq("id", client.plan_id).maybeSingle() : Promise.resolve({ data: null }),
            client.server_id ? supabaseAdmin.from("servers").select("id,name").eq("id", client.server_id).maybeSingle() : Promise.resolve({ data: null }),
            supabaseAdmin.from("clients").select("id,name,due_date,status").eq("referred_by", client.id),
            supabaseAdmin.from("settings").select("referral_reward_days,referral_enabled").eq("user_id", client.user_id).maybeSingle(),
          ]);

          const referralsPaidIds = new Set<string>();
          if (referrals && referrals.length > 0) {
            const ids = referrals.map((r) => r.id);
            const { data: paid } = await supabaseAdmin.from("payments").select("client_id").in("client_id", ids);
            (paid ?? []).forEach((p) => referralsPaidIds.add(p.client_id));
          }

          return json({
            client: {
              id: client.id,
              name: client.name,
              phone: client.phone,
              due_date: client.due_date,
              status: client.status,
              price_cents: client.price_cents,
              iptv_login: client.iptv_login,
              iptv_password: client.iptv_password,
              referral_code: client.referral_code,
              bonus_days: client.bonus_days,
            },
            plan,
            server,
            payments: payments ?? [],
            referrals: (referrals ?? []).map((r) => ({
              ...r,
              paid: referralsPaidIds.has(r.id),
            })),
            settings: settings ?? { referral_reward_days: 7, referral_enabled: true },
          });
        } catch (e) {
          return json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
