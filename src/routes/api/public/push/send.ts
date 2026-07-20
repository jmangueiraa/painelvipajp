import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { portalCorsHeaders, portalOptions } from "@/lib/portal-cors";

const SendSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(500),
  url: z.string().trim().max(500).optional().nullable(),
  audience: z.enum(["all", "active", "expired", "specific"]),
  clientIds: z.array(z.string().uuid()).max(5000).default([]),
});

function response(data: unknown, status = 200, request?: Request) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...portalCorsHeaders(request) },
  });
}


export const Route = createFileRoute("/api/public/push/send")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => portalOptions(request),
      POST: async ({ request }) => {
        try {

          const authorization = request.headers.get("authorization") ?? "";
          if (!authorization.startsWith("Bearer ")) {
            return response({ error: "Sessão inválida. Entre novamente." }, 401, request);
          }

          const input = SendSchema.parse(await request.json());
          const token = authorization.slice(7);
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          if (!supabaseUrl || !publishableKey) {
            return response({ error: "Conexão com o backend indisponível." }, 503, request);
          }
          const supabase = createClient<Database>(supabaseUrl, publishableKey, {
            global: { headers: { Authorization: authorization } },
            auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
          });
          const { data: authData, error: authError } = await supabase.auth.getUser(token);
          if (authError || !authData.user) {
            return response({ error: "Sessão expirada. Entre novamente." }, 401, request);
          }

          const userId = authData.user.id;
          let clientIds = input.clientIds;
          if (input.audience !== "specific") {
            const today = new Date().toISOString().slice(0, 10);
            let query = supabase.from("clients").select("id").eq("user_id", userId);
            if (input.audience === "active") query = query.gte("due_date", today);
            if (input.audience === "expired") query = query.lt("due_date", today);
            const { data, error } = await query;
            if (error) throw new Error(error.message);
            clientIds = (data ?? []).map((client) => client.id);
          } else if (clientIds.length) {
            const { data, error } = await supabase
              .from("clients")
              .select("id")
              .eq("user_id", userId)
              .in("id", clientIds);
            if (error) throw new Error(error.message);
            clientIds = (data ?? []).map((client) => client.id);
          }

          const { data: tokenRows, error: tokenError } = await supabase
            .from("push_tokens")
            .select("token")
            .eq("user_id", userId)
            .in("client_id", clientIds.length ? clientIds : ["00000000-0000-0000-0000-000000000000"]);
          if (tokenError) throw new Error(tokenError.message);

          const tokens = (tokenRows ?? []).map((row) => row.token);
          const { sendPushToTokens } = await import("@/lib/fcm-send.server");
          let result = { success: 0, failure: 0, invalidTokens: [] as string[] };
          let sendError: string | null = null;
          try {
            const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
            result = await sendPushToTokens({
              tokens,
              title: input.title,
              body: input.body,
              url: deriveUrl(input.title, input.url) || undefined,
              serviceAccountJson,
            });
          } catch (error) {
            sendError = error instanceof Error ? error.message : "Falha ao enviar notificação";
          }

          if (result.invalidTokens.length > 0) {
            await supabase.from("push_tokens").delete().in("token", result.invalidTokens);
          }

          const { error: logError } = await supabase.from("push_notifications_log").insert({
            user_id: userId,
            title: input.title,
            body: input.body,
            url: input.url || null,
            audience: input.audience,
            target_client_ids: clientIds,
            sent_at: new Date().toISOString(),
            status: sendError ? "failed" : "sent",
            success_count: result.success,
            failure_count: result.failure,
            error: sendError,
          });
          if (logError) throw new Error(logError.message);
          if (sendError) return response({ error: sendError }, 502, request);

          return response({
            scheduled: false,
            targets: clientIds.length,
            tokens: tokens.length,
            ...result,
          }, 200, request);

        } catch (error) {
          if (error instanceof z.ZodError) return response({ error: "Dados da notificação inválidos." }, 400, request);
          return response({ error: error instanceof Error ? error.message : "Erro ao enviar notificação." }, 500, request);
        }
      },
    },
  },
});