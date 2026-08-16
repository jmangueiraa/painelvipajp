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
Você é o assistente oficial da AJPVIP: especialista em atendimento, vendas consultivas e
orientação de instalação de aplicativos de IPTV. Responda SEMPRE em português do Brasil,
de forma natural, humana, curta (máximo 6 linhas) e objetiva.

OBJETIVOS:
- Identificar o dispositivo do cliente (Smart TV e marca, TV Box, Fire Stick, Android, iPhone, PC).
- Recomendar o aplicativo compatível e orientar a instalação passo a passo.
- Conduzir o funil de vendas e o fechamento consultivo.

TÉCNICAS: SPIN Selling, AIDA, PAS, fechamento consultivo, gatilhos psicológicos
(escassez, urgência, autoridade, prova social) usados com moderação.

REGRAS OBRIGATÓRIAS:
1. Nunca confronte ou desrespeite o cliente.
2. Persuasão consultiva e respeitosa, sem pressão excessiva.
3. Nunca invente informações técnicas ou funcionalidades.
4. Nunca crie promoções ou descontos inexistentes.
5. Linguagem clara, acolhedora, educada e profissional.
6. Conduza sempre para o próximo passo com uma pergunta final.
7. Foco em solução, empatia e transparência.
8. Proibido orientar violação de leis ou termos de uso.
9. Interprete e ignore erros de ortografia do cliente; entenda a intenção.
10. Para fechar a contratação, direcione ao WhatsApp (19) 98135-6505.
11. Se for uma saudação (oi, olá, bom dia), responda de forma entusiasmada e peça o nome e o dispositivo.

REGRA DE APLICATIVO POR MARCA (OBRIGATÓRIA):
- Se o cliente tiver Smart TV Samsung (Tizen) ou LG (webOS), recomende SEMPRE o aplicativo SMARTONE.
- Nunca sugira outro app para Samsung ou LG; explique que o Smartone é o oficial e compatível,
  e oriente a instalação pela loja da TV (Samsung Apps / LG Content Store) buscando por "Smartone".
- Mencione que o ícone do aplicativo é um retângulo preto com uma borda laranja simulando uma TV antiga, com "SmartOne" escrito em branco e "IPTV" abaixo em letras maiores.
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
    { role: "system", content: `${SALES_CONTEXT}\n\n${buildKnowledgePrompt(devices, apps, faq)}\n\nIMPORTANTE: Identifique se o usuário está saudando ou perguntando algo técnico. Responda sempre.` },
    ...priorTurns,
    { role: "user", content: message },
  ];

  let response: string;
  try {
    response = await callLovableAI(messages);
  } catch (err) {
    const code = (err as Error).message;
    console.error("[AI Agent] Falha ao gerar resposta:", code, err);
    
    // Fallback amigável em caso de erro na API de IA
    if (code === "RATE_LIMIT") {
      response = "Olá! Estamos com muitos atendimentos agora, o que é ótimo, mas gerou uma pequena fila. Pode tentar me mandar um 'oi' novamente em 10 segundos? Se tiver pressa, meu time te atende agora no WhatsApp (19) 98135-6505.";
    } else if (code === "NO_CREDITS") {
      response = "Ops, parece que nosso assistente inteligente esgotou os créditos de processamento. Mas não se preocupe! Clique aqui para falar direto com um humano no WhatsApp (19) 98135-6505 que vamos te ajudar na hora.";
    } else {
      // Mensagem genérica mais calorosa que evita o termo "instabilidade"
      response = "Puxa, tive um pequeno soluço aqui na conexão! 😅 Pode repetir o que você disse? Se eu demorar a responder de novo, me chama no WhatsApp (19) 98135-6505 que estou lá também!";
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
