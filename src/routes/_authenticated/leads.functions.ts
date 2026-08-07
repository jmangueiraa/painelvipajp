import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getLeadsStats = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data: leads, error } = await supabaseAdmin
      .from("leads")
      .select("*");

    if (error) throw error;

    const total = leads.length;
    const byPlatform = leads.reduce((acc: any, lead) => {
      acc[lead.platform] = (acc[lead.platform] || 0) + 1;
      return acc;
    }, {});
    
    const byKeyword = leads.reduce((acc: any, lead) => {
      acc[lead.keyword] = (acc[lead.keyword] || 0) + 1;
      return acc;
    }, {});

    return { total, byPlatform, byKeyword, leads };
  });

export const updateLeadStatus = createServerFn({ method: "POST" })
  .input(z.object({ id: z.string(), status: z.string() }))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("leads")
      .update({ status: data.status as any })
      .eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });
