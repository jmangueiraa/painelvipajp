import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const evolutionAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ action: z.enum(["settings", "save", "status", "qr", "disconnect"]), base_url: z.string().optional(), instance_name: z.string().optional(), api_key: z.string().optional() }).parse(data))
  .handler(async ({ context, data }) => {
    // RLS-owned settings row proves this account can configure its own integration.
    const { data: owner, error } = await context.supabase.from("settings").select("user_id").eq("user_id", context.userId).maybeSingle();
    if (error || !owner) throw new Error("Esta conta não possui configurações de integração.");
    const service = await import("./evolution-api.server");
    if (data.action === "save") return service.saveEvolutionConfig(context.userId, { base_url: data.base_url ?? "", instance_name: data.instance_name ?? "", api_key: data.api_key });
    if (data.action === "settings") {
      const config = await service.getEvolutionConfig(context.userId);
      return { base_url: config?.base_url ?? "", instance_name: config?.instance_name ?? "", configured: Boolean(config) };
    }
    return service.evolutionConnectionAction(context.userId, data.action);
  });