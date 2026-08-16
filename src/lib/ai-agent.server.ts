import { z } from "zod";

const MODEL = "google/gemini-3.6-flash";

async function safeSelect(table: string, filter?: { column: string; value: unknown }) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = (supabaseAdmin.from as any)(table).select("*");
    if (filter) query = query.eq(filter.column, filter.value);
    const { data, error } = await query;
    if (error) {
      console.error(`[AI Agent] Error fetching ${table}:`, error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error(`[AI Agent] Fatal error fetching ${table}:`, err);
    return [];
  }
}

export const getAgentKnowledgeLogic = async () => {
  const [devices, apps, faq] = await Promise.all([
    safeSelect("ai_agent_devices"),
    safeSelect("ai_agent_apps", { column: "is_active", value: true }),
    safeSelect("ai_agent_faq"),
  ]);

  return { devices, apps, faq };
};

const SALES_CONTEXT = `
Você é o assistente oficial da AJPVIP: um Expert Especialista em Instalação de IPTV e suporte técnico avançado.
Responda SEMPRE em português do Brasil, de forma natural, humana, curta (máximo 6 linhas) e com autoridade técnica.

SUA PERSONALIDADE:
- Especialista, prestativo e focado em resolver problemas técnicos rapidamente.
- Você entende tudo sobre Smart TVs (Samsung, LG, Roku, TCL), TV Box, Fire Stick e smartphones.

OBJETIVOS:
- Identificar o dispositivo do cliente imediatamente para dar o tutorial correto.
- Recomendar o aplicativo compatível e orientar a instalação passo a passo.
- Conduzir o funil de vendas e o fechamento consultivo via WhatsApp.

REGRAS OBRIGATÓRIAS:
1. Especialista em Instalação: Se o cliente disser que quer instalar ou pedir ajuda, você DEVE perguntar o modelo da TV ou aparelho.
2. Autoridade SmartOne: Para Samsung e LG, o SmartOne é a ÚNICA recomendação correta.
3. Proatividade: Nunca responda apenas "vou te ajudar". Diga "Vou te ajudar agora! Qual é a marca da sua TV ou o aparelho que você vai usar?"
4. Linguagem clara e profissional, focada em suporte técnico.
5. Encerrar sempre com uma pergunta que leve à ação (ex: "Qual a marca do seu aparelho?").
6. Interprete erros de ortografia ("instala", "iptv", "samsumg") e foque na intenção.
7. Se houver falha técnica, direcione com autoridade para o suporte humano no WhatsApp (19) 98135-6505.

REGRA DE APLICATIVO POR MARCA (OBRIGATÓRIA):
- Smart TV Samsung (Tizen) ou LG (webOS): Recomende SEMPRE o aplicativo SMARTONE.
- Explique que o ícone é um retângulo preto com borda laranja simulando uma TV antiga.
- Instrua a buscar por "Smartone" na loja de aplicativos oficial da TV.
`;


function buildKnowledgePrompt(devices: any[], apps: any[], faq: any[]) {
  const appsTxt = apps.length
    ? apps
        .map((a: any) => {
          const steps = Array.isArray(a.installation_steps)
            ? a.installation_steps.map((s: string, i: number) => `${i + 1}. ${s}`).join(" | ")
            : "";
          return `- ${a.app_name} (categoria: ${a.device_category ?? "geral"}): ${a.description ?? ""}${steps ? ` | Passos: ${steps}` : ""}`;
        })
        .join("\n")
    : "(nenhum aplicativo cadastrado)";

  const devicesTxt = devices.length
    ? devices.map((d: any) => `- ${d.device_name ?? d.name ?? "dispositivo"}: ${d.notes ?? d.description ?? ""}`).join("\n")
    : "(nenhum dispositivo cadastrado)";

  const faqTxt = faq.length
    ? faq.map((f: any) => `- P: ${f.question ?? (f.keywords || []).join(", ")}\n  R: ${f.answer}`).join("\n")
    : "(nenhuma FAQ cadastrada)";

  return `BASE DE CONHECIMENTO (use como fonte de verdade):

APLICATIVOS DISPONÍVEIS:
${appsTxt}

DISPOSITIVOS SUPORTADOS:
${devicesTxt}

PERGUNTAS FREQUENTES:
${faqTxt}`;
}

async function callLovableAI(messages: Array<{ role: string; content: string }>) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("MISSING_AI_KEY");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({ model: MODEL, messages }),
  });

  if (res.status === 429) throw new Error("RATE_LIMIT");
  if (res.status === 402) throw new Error("NO_CREDITS");
  if (!res.ok) {
    const txt = await res.text();
    console.error("[AI Agent] Gateway error:", res.status, txt.slice(0, 500));
    throw new Error("AI_ERROR");
  }

  const data = (await res.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") throw new Error("EMPTY_RESPONSE");
  return content.trim().replace(/^"|"$/g, '');
}

export const processAgentMessageLogic = async (input: {
  sessionId: string;
  message: string;
  history?: any[];
  public?: boolean;
}) => {
  const { sessionId, message, history = [] } = z
    .object({
      sessionId: z.string(),
      message: z.string(),
      history: z.array(z.any()).optional(),
      public: z.boolean().optional(),
    })
    .parse(input);

  const [devices, apps, faq] = await Promise.all([
    safeSelect("ai_agent_devices"),
    safeSelect("ai_agent_apps", { column: "is_active", value: true }),
    safeSelect("ai_agent_faq"),
  ]);

  const priorTurns = (Array.isArray(history) ? history : [])
    .filter((m: any) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
    .slice(-20)
    .map((m: any) => ({ role: m.role, content: m.content }));

  const messages = [
    { role: "system", content: `${SALES_CONTEXT}\n\n${buildKnowledgePrompt(devices, apps, faq)}\n\nIMPORTANTE: Se o usuário der uma resposta incompleta ou curta, você DEVE fazer perguntas para descobrir o dispositivo dele e dar continuidade ao atendimento.` },
    ...priorTurns,
    { role: "user", content: message },
  ];

  let response: string;
  try {
    const aiPromise = callLovableAI(messages);
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("AI_TIMEOUT")), 40000)
    );
    
    response = await Promise.race([aiPromise, timeoutPromise]);
  } catch (err) {
    const code = (err as Error).message;
    console.error("[AI Agent] Falha ao gerar resposta:", code, err);
    
    const lowerMsg = message.toLowerCase();
    const isInstallRequest = lowerMsg.includes("instalar") || lowerMsg.includes("como") || lowerMsg.includes("aparelho") || lowerMsg.includes("tv") || lowerMsg.includes("box") || lowerMsg.includes("ajuda");

    if (code === "RATE_LIMIT") {
      response = "Olá! Nosso sistema está com muitos acessos, mas como sou especialista em instalação, vou te agilizar: Me chama no WhatsApp (19) 98135-6505 que te mando o tutorial agora mesmo! 🚀";
    } else if (code === "NO_CREDITS") {
      response = "Nosso assistente expert está em manutenção rápida. 🛠️ Para não perder tempo com sua instalação, clique aqui e fale direto no WhatsApp (19) 98135-6505.";
    } else if (isInstallRequest) {
      if (lowerMsg.includes("samsung") || lowerMsg.includes("lg")) {
        response = "Para sua Smart TV Samsung ou LG, instale o aplicativo SMARTONE IPTV! 📺 É o melhor e mais estável. Busque por ele na loja de apps da sua TV. Se precisar da lista de canais, me chama no WhatsApp (19) 98135-6505!";
      } else {
        response = "Perfeito! Sou especialista em instalação e vou te guiar. 🚀 Qual é a marca da sua TV ou qual aparelho você está usando (TV Box, Fire Stick, Celular)? Se quiser o tutorial em vídeo, me chama no WhatsApp (19) 98135-6505.";
      }
    } else {
      if (lowerMsg.includes("oi") || lowerMsg.includes("olá") || lowerMsg.includes("ola") || lowerMsg.includes("bom dia") || lowerMsg.includes("boa tarde")) {
        response = "Olá! Sou o especialista em instalação da AJPVIP. 🚀 Para eu te ajudar agora, qual é o seu nome e em qual aparelho você deseja instalar nosso sistema?";
      } else if (lowerMsg.includes("valor") || lowerMsg.includes("preço") || lowerMsg.includes("plano") || lowerMsg.includes("quanto")) {
        response = "Temos planos a partir de R$ 30,00 com a melhor estabilidade do mercado! 💎 Quer que eu te envie o link dos planos ou prefere tirar dúvidas no WhatsApp (19) 98135-6505?";
      } else {
        response = "Estou aqui! Tivemos uma pequena oscilação, mas sou especialista em resolver. 😅 O que exatamente você precisa sobre a instalação ou nossos planos? Se preferir, o suporte VIP está no WhatsApp (19) 98135-6505.";
      }
    }
  }

  const newHistory = [
    ...priorTurns,
    { role: "user", content: message },
    { role: "assistant", content: response },
  ];

  (async () => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      
      // Busca a conversa existente para obter o ID e evitar duplicidade/conflito
      const { data: existing, error: fetchError } = await (supabaseAdmin.from as any)("ai_agent_conversations")
        .select("id")
        .eq("session_id", sessionId)
        .maybeSingle();

      if (fetchError) {
        console.warn("[AI Agent] History fetch error (non-fatal):", fetchError.message);
      }

      // Upsert robusto: se existir um ID, usa ele para garantir o update
      const payload: any = {
        session_id: sessionId,
        messages: newHistory,
        updated_at: new Date().toISOString()
      };

      if (existing?.id) {
        payload.id = existing.id;
      }

      const { error: upsertError } = await (supabaseAdmin.from as any)("ai_agent_conversations").upsert(payload);
      
      if (upsertError) {
        console.error("[AI Agent] History upsert failed:", upsertError.message);
      }
    } catch (saveErr) {
      console.error("[AI Agent] Background history save failed:", saveErr);
    }
  })();

  return { response, history: newHistory };
};

export const getConversationsLogic = async () => {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin.from as any)("ai_agent_conversations")
      .select("*, clients(name)")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error fetching conversations:", error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error("Fatal error in getConversationsLogic:", err);
    return [];
  }
};

export const updateKnowledgeItemLogic = async (type: "device" | "app" | "faq", item: any) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const table = type === "device" ? "ai_agent_devices" : type === "app" ? "ai_agent_apps" : "ai_agent_faq";

  const { data, error } = await (supabaseAdmin.from as any)(table).upsert(item).select().single();
  if (error) throw error;
  return data;
};

export const deleteKnowledgeItemLogic = async (type: "device" | "app" | "faq", id: string) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const table = type === "device" ? "ai_agent_devices" : type === "app" ? "ai_agent_apps" : "ai_agent_faq";

  const { error } = await (supabaseAdmin.from as any)(table).delete().eq("id", id);
  if (error) throw error;
  return true;
};