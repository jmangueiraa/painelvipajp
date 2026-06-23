import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const setPortalCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { clientId: string; username: string | null; password: string | null }) => data)
  .handler(async ({ data, context }) => {
    const { clientId, username, password } = data;

    // Confirma que o cliente pertence ao usuário logado
    const { data: client, error: cErr } = await context.supabase
      .from("clients")
      .select("id,user_id")
      .eq("id", clientId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!client || client.user_id !== context.userId) throw new Error("Cliente não encontrado");

    const update: Record<string, string | null> = {};
    const u = (username ?? "").trim();
    update.portal_username = u.length > 0 ? u : null;

    if (password && password.length > 0) {
      if (password.length < 4) throw new Error("Senha muito curta (mín. 4)");
      const { hashPassword } = await import("@/integrations/portal/session.server");
      update.portal_password_hash = hashPassword(password);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("clients").update(update).eq("id", clientId);
    if (error) throw error;
    return { ok: true };
  });
