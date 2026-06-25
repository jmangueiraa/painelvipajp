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

          const { data: clientRow } = await supabaseAdmin.from("clients").select("allowed_plan_ids").eq("id", client.id).maybeSingle();
          const allowedIds = (clientRow?.allowed_plan_ids ?? []) as string[];

          let plansQuery = supabaseAdmin.from("plans").select("id,name,price_cents,duration_days,active").eq("user_id", client.user_id).eq("active", true).order("duration_days", { ascending: true });
          if (allowedIds.length > 0) plansQuery = plansQuery.in("id", allowedIds);

          const [{ data: payments }, { data: plan }, { data: server }, { data: referrals }, { data: settings }, { data: plans }, { data: updates }] = await Promise.all([
            supabaseAdmin.from("payments").select("id,amount_cents,paid_at,method").eq("client_id", client.id).order("paid_at", { ascending: false }).limit(50),
            client.plan_id ? supabaseAdmin.from("plans").select("id,name,price_cents,duration_days").eq("id", client.plan_id).maybeSingle() : Promise.resolve({ data: null }),
            client.server_id ? supabaseAdmin.from("servers").select("id,name").eq("id", client.server_id).maybeSingle() : Promise.resolve({ data: null }),
            supabaseAdmin.from("clients").select("id,name,due_date,status").eq("referred_by", client.id),
            supabaseAdmin.from("settings").select("referral_reward_days,referral_enabled,app_android_url,app_ios_url").eq("user_id", client.user_id).maybeSingle(),
            plansQuery,
            supabaseAdmin.from("content_updates").select("id,kind,title,description,image_url,created_at").eq("user_id", client.user_id).order("created_at", { ascending: false }).limit(100),
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
              points: client.points ?? 1,
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
            settings: settings ?? { referral_reward_days: 30, referral_enabled: true },
            plans: plans ?? [],
          });
        } catch (e) {
          return json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
