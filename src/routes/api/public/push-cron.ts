import { createFileRoute } from "@tanstack/react-router";

// pg_cron hits this endpoint every 5 minutes (auth via apikey header).
// - Processes any push_notifications_log rows with status='scheduled' whose scheduled_at <= now()
// - Once/day (09:00 window): sends automatic reminders (3 days before, on due date) and expired notice

async function sendForUser(supabaseAdmin: any, userId: string, clientIds: string[], title: string, body: string, url: string, audience: string) {
  if (clientIds.length === 0) return { success: 0, failure: 0 };
  const { data: tokRows } = await supabaseAdmin.from("push_tokens").select("token").in("client_id", clientIds);
  const tokens = (tokRows || []).map((r: { token: string }) => r.token);
  const { sendPushToTokens } = await import("@/lib/fcm-send.server");
  let result = { success: 0, failure: 0, invalidTokens: [] as string[] };
  let errMsg: string | null = null;
  try { result = await sendPushToTokens({ tokens, title, body, url }); }
  catch (e) { errMsg = (e as Error).message; }
  await supabaseAdmin.from("push_notifications_log").insert({
    user_id: userId, title, body, url, audience,
    target_client_ids: clientIds, sent_at: new Date().toISOString(),
    status: errMsg ? "failed" : "sent",
    success_count: result.success, failure_count: result.failure, error: errMsg,
  });
  return result;
}

export const Route = createFileRoute("/api/public/push-cron")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") || "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY || "";
        if (!expected || apikey !== expected) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const nowIso = new Date().toISOString();
        const summary: any = { scheduled: 0, reminders: 0 };

        // 1) Process scheduled logs whose time has come
        const { data: due } = await supabaseAdmin
          .from("push_notifications_log")
          .select("id, user_id, title, body, url, audience, target_client_ids")
          .eq("status", "scheduled")
          .lte("scheduled_at", nowIso)
          .limit(50);

        for (const row of due || []) {
          const ids: string[] = row.target_client_ids || [];
          const { data: tokRows } = await supabaseAdmin.from("push_tokens").select("token").in("client_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
          const tokens = (tokRows || []).map((r: { token: string }) => r.token);
          const { sendPushToTokens } = await import("@/lib/fcm-send.server");
          let result = { success: 0, failure: 0, invalidTokens: [] as string[] };
          let errMsg: string | null = null;
          try { result = await sendPushToTokens({ tokens, title: row.title, body: row.body, url: row.url || undefined }); }
          catch (e) { errMsg = (e as Error).message; }
          await supabaseAdmin.from("push_notifications_log").update({
            status: errMsg ? "failed" : "sent",
            sent_at: nowIso,
            success_count: result.success,
            failure_count: result.failure,
            error: errMsg,
          }).eq("id", row.id);
          summary.scheduled++;
        }

        // 2) Automatic reminders — only inside 09:00-09:59 UTC-3 (=12:00-12:59 UTC)
        const hourUtc = new Date().getUTCHours();
        if (hourUtc === 12) {
          const { data: users } = await supabaseAdmin.from("settings").select("user_id");
          const today = new Date(); today.setUTCHours(0, 0, 0, 0);
          const in1 = new Date(today); in1.setUTCDate(in1.getUTCDate() + 1);
          const in3 = new Date(today); in3.setUTCDate(in3.getUTCDate() + 3);
          const back1 = new Date(today); back1.setUTCDate(back1.getUTCDate() - 1);
          const todayStr = today.toISOString().slice(0, 10);
          const in1Str = in1.toISOString().slice(0, 10);
          const in3Str = in3.toISOString().slice(0, 10);
          const back1Str = back1.toISOString().slice(0, 10);

          for (const u of users || []) {
            // 3 dias antes
            const { data: due3 } = await supabaseAdmin.from("clients").select("id").eq("user_id", u.user_id).eq("due_date", in3Str);
            const ids3 = (due3 || []).map((r: any) => r.id);
            if (ids3.length) {
              await sendForUser(supabaseAdmin, u.user_id, ids3, "💰 Lembrete de vencimento", "⏰ Seu plano vence em 3 dias. Renove antecipadamente e evite interrupções no acesso.", "/portal/painel", "auto_due_3d");
              summary.reminders++;
            }
            // 1 dia antes
            const { data: due1 } = await supabaseAdmin.from("clients").select("id").eq("user_id", u.user_id).eq("due_date", in1Str);
            const ids1d = (due1 || []).map((r: any) => r.id);
            if (ids1d.length) {
              await sendForUser(supabaseAdmin, u.user_id, ids1d, "⚠️ Seu plano vence amanhã", "📅 Faça a renovação agora para continuar aproveitando o serviço sem pausas.", "/portal/painel", "auto_due_1d");
              summary.reminders++;
            }
            // vence hoje
            const { data: dueToday } = await supabaseAdmin.from("clients").select("id").eq("user_id", u.user_id).eq("due_date", todayStr);
            const idsToday = (dueToday || []).map((r: any) => r.id);
            if (idsToday.length) {
              await sendForUser(supabaseAdmin, u.user_id, idsToday, "🚨 Último dia da sua assinatura", "Hoje é o último dia da sua assinatura. Renove agora e mantenha seu acesso ativo.", "/portal/painel", "auto_due_today");
              summary.reminders++;
            }
            // 1 dia após vencimento
            const { data: overdue } = await supabaseAdmin.from("clients").select("id").eq("user_id", u.user_id).eq("due_date", back1Str);
            const idsOver = (overdue || []).map((r: any) => r.id);
            if (idsOver.length) {
              await sendForUser(supabaseAdmin, u.user_id, idsOver, "❌ Acesso suspenso", "Seu acesso foi suspenso por falta de pagamento. Regularize agora e a reativação será feita rapidamente.", "/portal/painel", "auto_overdue");
              summary.reminders++;
            }
          }
        }


        return Response.json({ ok: true, ...summary });
      },
    },
  },
});
