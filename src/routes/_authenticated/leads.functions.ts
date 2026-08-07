import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getLeadsStats = createServerFn({ method: "GET" })
  .handler(async () => {
    // @ts-ignore
    const { data: leads, error } = await supabaseAdmin
      .from("leads")
      .select("*");

    if (error) throw error;

    const total = (leads as any[])?.length || 0;
    const byPlatform = (leads as any[] || []).reduce((acc: any, lead: any) => {
      acc[lead.platform] = (acc[lead.platform] || 0) + 1;
      return acc;
    }, {});
    
    const byKeyword = (leads as any[] || []).reduce((acc: any, lead: any) => {
      acc[lead.keyword] = (acc[lead.keyword] || 0) + 1;
      return acc;
    }, {});

    return { total, byPlatform, byKeyword, leads: (leads as any[]) || [] };
  });

export const updateLeadStatus = createServerFn({ method: "POST" })
  .handler(async (ctx) => {
    const data = z.object({ id: z.string(), status: z.string() }).parse(ctx.data);
    // @ts-ignore
    const { error } = await supabaseAdmin
      .from("leads")
      .update({ status: data.status as any })
      .eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });
