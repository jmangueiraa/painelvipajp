import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SendSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  url: z.string().max(500).optional().nullable(),
  audience: z.enum(["all", "active", "expired", "specific"]),
  clientIds: z.array(z.string().uuid()).optional().default([]),
  scheduledAt: z.string().datetime().optional().nullable(),
});

async function selectClientIds(supabase: any, userId: string, audience: string, ids: string[]): Promise<string[]> {
  if (audience === "specific") return ids;
  const today = new Date().toISOString().slice(0, 10);
  let q = supabase.from("clients").select("id").eq("user_id", userId);
  if (audience === "active") q = q.gte("due_date", today);
  else if (audience === "expired") q = q.lt("due_date", today);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map((r: { id: string }) => r.id);
}

export const sendPushNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SendSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const clientIds = await selectClientIds(supabase, userId, data.audience, data.clientIds || []);

    // Schedule for later?
    if (data.scheduledAt && new Date(data.scheduledAt).getTime() > Date.now() + 30_000) {
      const { data: row, error } = await supabase
        .from("push_notifications_log")
        .insert({
          user_id: userId,
          title: data.title,
          body: data.body,
          url: data.url || null,
          audience: data.audience,
          target_client_ids: clientIds,
          scheduled_at: data.scheduledAt,
          status: "scheduled",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { scheduled: true, id: row.id, targets: clientIds.length };
    }

    // Send now
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tokRows, error: tokErr } = await supabaseAdmin
      .from("push_tokens")
      .select("token")
      .in("client_id", clientIds.length ? clientIds : ["00000000-0000-0000-0000-000000000000"]);
    if (tokErr) throw new Error(tokErr.message);
    const tokens = (tokRows || []).map((r: { token: string }) => r.token);

    const { sendPushToTokens } = await import("./fcm-send.server");
    let result = { success: 0, failure: 0, invalidTokens: [] as string[] };
    let errMsg: string | null = null;
    try {
      result = await sendPushToTokens({ tokens, title: data.title, body: data.body, url: data.url || undefined });
    } catch (e) {
      errMsg = (e as Error).message;
    }

    await supabase.from("push_notifications_log").insert({
      user_id: userId,
      title: data.title,
      body: data.body,
      url: data.url || null,
      audience: data.audience,
      target_client_ids: clientIds,
      sent_at: new Date().toISOString(),
      status: errMsg ? "failed" : "sent",
      success_count: result.success,
      failure_count: result.failure,
      error: errMsg,
    });

    if (errMsg) throw new Error(errMsg);
    return { scheduled: false, targets: clientIds.length, tokens: tokens.length, ...result };
  });

export const listPushHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("push_notifications_log")
      .select("id, title, body, audience, url, status, success_count, failure_count, sent_at, scheduled_at, created_at, error")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data || [];
  });

export const cancelScheduledPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("push_notifications_log")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("status", "scheduled");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listClientsForPush = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("clients")
      .select("id, name, iptv_login, due_date")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  });
