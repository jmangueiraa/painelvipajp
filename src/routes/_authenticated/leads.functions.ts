import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getLeadsStats = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    // @ts-ignore
    const { data: leads, error } = await (supabaseAdmin.from as any)("leads").select("*");

    if (error) throw error;

    const leadsArr = (leads as any[]) || [];
    const total = leadsArr.length;
    
    const byPlatform = leadsArr.reduce((acc: any, lead: any) => {
      acc[lead.platform] = (acc[lead.platform] || 0) + 1;
      return acc;
    }, {});
    
    const byKeyword = leadsArr.reduce((acc: any, lead: any) => {
      acc[lead.keyword] = (acc[lead.keyword] || 0) + 1;
      return acc;
    }, {});

    const avgScore = total > 0 
      ? Math.round(leadsArr.reduce((acc: number, lead: any) => acc + (lead.lead_score || 0), 0) / total)
      : 0;

    return { 
      total, 
      byPlatform, 
      byKeyword, 
      leads: leadsArr,
      avgScore
    };
  });

export const updateLeadStatus = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string(), status: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // @ts-ignore
    const { error } = await (supabaseAdmin.from as any)("leads")
      .update({ status: data.status as any })
      .eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });

export const askIA = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ query: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { query } = data;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // @ts-ignore
    const { data: leads } = await (supabaseAdmin.from as any)("leads").select("*");
    const leadsArr = (leads as any[]) || [];

    const q = query.toLowerCase();

    if (q.includes("20 leads") || q.includes("maior chance") || q.includes("melhores")) {
      const top = leadsArr
        .sort((a, b) => (b.lead_score || 0) - (a.lead_score || 0))
        .slice(0, 20);
      return { answer: `Aqui estão os leads com maior Lead Score no momento:\n\n` + 
        top.map(l => `- ${l.name || 'Anônimo'} (Score: ${l.lead_score || 0})`).join('\n') };
    }

    if (q.includes("semana") || q.includes("hoje") || q.includes("recentes")) {
      const recent = leadsArr.filter(l => {
        const d = new Date(l.created_at);
        const now = new Date();
        return (now.getTime() - d.getTime()) < 7 * 24 * 60 * 60 * 1000;
      });
      return { answer: `Identifiquei ${recent.length} novos leads esta semana.` };
    }

    if (q.includes("não receberam") || q.includes("abordagem") || q.includes("contato")) {
      const noContact = leadsArr.filter(l => l.status === 'Novo' || !l.last_contacted_at);
      return { answer: `Existem ${noContact.length} leads que ainda não foram abordados.` };
    }

    return { answer: "Não consegui processar essa pergunta específica, mas posso te ajudar com estatísticas de leads, melhores scores e status de contato." };
  });
