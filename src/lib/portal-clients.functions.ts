import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PortalClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  plan_name: string | null;
  status: "ativo" | "vencido" | "suspenso" | "cancelado";
  due_date: string;
  created_at: string;
  pwa_installed_at: string | null;
  last_login_at: string | null;
  last_device: string | null;
  login_count: number;
  os: string | null;
  browser: string | null;
  app_version: string | null;
  installed: boolean;
};

export const listPortalClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PortalClientRow[]> => {
    const { data, error } = await context.supabase
      .from("clients")
      .select(
        "id,name,email,phone,due_date,status,created_at,pwa_installed_at,last_login_at,last_device,login_count,plans(name)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const clients = (data || []) as Array<{
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      due_date: string;
      status: PortalClientRow["status"];
      created_at: string;
      pwa_installed_at: string | null;
      last_login_at: string | null;
      last_device: string | null;
      login_count: number | null;
      plans: { name: string } | null;
    }>;

    const ids = clients.map((c) => c.id);
    const tokensByClient = new Map<string, { os: string | null; browser: string | null; app_version: string | null }>();
    if (ids.length) {
      const { data: toks } = await context.supabase
        .from("push_tokens")
        .select("client_id,os,browser,app_version,last_seen_at")
        .in("client_id", ids)
        .order("last_seen_at", { ascending: false });
      for (const t of (toks || []) as Array<{
        client_id: string;
        os: string | null;
        browser: string | null;
        app_version: string | null;
      }>) {
        if (!tokensByClient.has(t.client_id)) {
          tokensByClient.set(t.client_id, { os: t.os, browser: t.browser, app_version: t.app_version });
        }
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return clients.map((c) => {
      const due = new Date(c.due_date + "T00:00:00");
      let status: PortalClientRow["status"] = c.status;
      if (status !== "suspenso" && status !== "cancelado") {
        status = due < today ? "vencido" : "ativo";
      }
      const t = tokensByClient.get(c.id) || { os: null, browser: null, app_version: null };
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        plan_name: c.plans?.name ?? null,
        status,
        due_date: c.due_date,
        created_at: c.created_at,
        pwa_installed_at: c.pwa_installed_at,
        last_login_at: c.last_login_at,
        last_device: c.last_device,
        login_count: c.login_count ?? 0,
        os: t.os,
        browser: t.browser,
        app_version: t.app_version,
        installed: !!c.pwa_installed_at,
      };
    });
  });

export const getPortalClientDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: client, error } = await context.supabase
      .from("clients")
      .select(
        "id,name,email,phone,doc,address,due_date,status,created_at,pwa_installed_at,last_login_at,last_device,login_count,portal_username,iptv_login,notes,plans(name),servers(name)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!client) throw new Error("Cliente não encontrado");

    const [{ data: payments }, { data: accesses }, { data: tokens }] = await Promise.all([
      context.supabase
        .from("payments")
        .select("id,amount_cents,paid_at,method,notes")
        .eq("client_id", data.id)
        .order("paid_at", { ascending: false })
        .limit(50),
      context.supabase
        .from("portal_access_log")
        .select("id,event,os,browser,ip,created_at")
        .eq("client_id", data.id)
        .order("created_at", { ascending: false })
        .limit(50),
      context.supabase
        .from("push_tokens")
        .select("os,browser,app_version,installed_at,last_seen_at,platform")
        .eq("client_id", data.id)
        .order("last_seen_at", { ascending: false })
        .limit(10),
    ]);

    return {
      client,
      payments: payments || [],
      accesses: accesses || [],
      tokens: tokens || [],
    };
  });
