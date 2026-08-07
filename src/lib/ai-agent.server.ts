import { z } from "zod";
import { findBestMatch } from "string-similarity";

export const getAgentKnowledgeLogic = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  
  const { data: devices, error: devError } = await (supabaseAdmin.from as any)("ai_agent_devices").select("*").catch(() => ({ data: [], error: null }));
  if (devError) console.error("Error fetching devices:", devError);
  
  const { data: apps, error: appError } = await (supabaseAdmin.from as any)("ai_agent_apps").select("*").eq("is_active", true).catch(() => ({ data: [], error: null }));
  if (appError) console.error("Error fetching apps:", appError);
  
  const { data: faq, error: faqError } = await (supabaseAdmin.from as any)("ai_agent_faq").select("*").catch(() => ({ data: [], error: null }));
  if (faqError) console.error("Error fetching faq:", faqError);

  return {
    devices: devices || [],
    apps: apps || [],
    faq: faq || []
  };
};

export const processAgentMessageLogic = async (input: { 
  sessionId: string; 
  message: string; 
  history?: any[]; 
  public?: boolean;
}) => {
  const { sessionId, message, history = [], public: isPublic = false } = z.object({ 
    sessionId: z.string(), 
    message: z.string(),
    history: z.array(z.any()).optional(),
    public: z.boolean().optional()
  }).parse(input);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: devices, error: devError } = await (supabaseAdmin.from as any)("ai_agent_devices").select("*").catch(() => ({ data: [], error: null }));
  const { data: apps, error: appError } = await (supabaseAdmin.from as any)("ai_agent_apps").select("*").eq("is_active", true).catch(() => ({ data: [], error: null }));
  const { data: faq, error: faqError } = await (supabaseAdmin.from as any)("ai_agent_faq").select("*").catch(() => ({ data: [], error: null }));

  if (devError || appError || faqError) {
    console.error("Database fetch error in processAgentMessage:", { devError, appError, faqError });
  }

  const msg = message.toLowerCase().trim();
  
  // Memória e Diretrizes de Vendas (System Context)
  const salesContext = `
    - Funil de vendas completo.
    - Respostas automáticas para mais de 100 objeções.
    - Qualificação do cliente constante.
    - Gatilhos psicológicos (escassez, urgência, autoridade).
    - Técnicas: SPIN Selling, AIDA, PAS e Fechamento Consultivo.
    
    REGRAS OBRIGATÓRIAS DE ATENDIMENTO:
    1. Nunca confronte ou desrespeite o cliente.
    2. Persuasão consultiva e respeitosa, sem pressão excessiva.
    3. Nunca invente informações técnicas ou funcionalidades.
    4. Nunca crie promoções ou descontos inexistentes.
    5. Linguagem clara, acolhedora, educada e profissional.
    6. Conduza sempre para o próximo passo com uma pergunta final.
    7. Foco em solução, empatia e transparência.
    8. Proibido orientar violação de leis ou termos.
  `;

  let response = "";

  const commonBrands = ["samsung", "lg", "tcl", "philips", "sony", "aoc", "hisense", "philco"];
  
  // Fuzzy brand detection
  let fuzzyBrand = null;
  if (msg.length > 2) {
    const brandMatches = findBestMatch(msg, commonBrands);
    if (brandMatches.bestMatch.rating > 0.6) {
      fuzzyBrand = brandMatches.bestMatch.target;
    } else {
      // Check if any word in the message matches a brand
      const words = msg.split(/\s+/);
      for (const word of words) {
        if (word.length < 3) continue;
        const wordMatch = findBestMatch(word, commonBrands);
        if (wordMatch.bestMatch.rating > 0.8) {
          fuzzyBrand = wordMatch.bestMatch.target;
          break;
        }
      }
    }
  }

  const greetings = ["oi", "olá", "ola", "bom dia", "boa tarde", "boa noite", "eai", "opa"];
  const isGreeting = greetings.some(g => {
    if (msg === g) return true;
    if (msg.length > 2) {
      return findBestMatch(msg, [g]).bestMatch.rating > 0.8;
    }
    return false;
  });

  if (isGreeting || msg === "") {
    response = "Olá! Sou seu assistente de suporte e vendas AJPVIP. Como posso ajudar você hoje? Qual seu nome e qual dispositivo você pretende usar? \n\nEstou aqui para te guiar no funil de vendas, tirar dúvidas e realizar seu fechamento consultivo!";
  } else if (fuzzyBrand && !response && !msg.includes("tutorial") && !msg.includes("passo")) {
    const compatibleApps = apps?.filter((a: any) => a.device_category?.toLowerCase().includes('tv'));
    response = `Entendi, você está usando um aparelho da ${fuzzyBrand.toUpperCase()}. Geralmente para essa marca recomendamos:\n\n` +
      (compatibleApps && compatibleApps.length > 0 ? compatibleApps.map((a: any) => `- ${a.app_name}`).join("\n") : "O aplicativo oficial da AJP.") +
      "\n\nGostaria do tutorial de algum desses?";
  } else if (msg.includes("tv") && (fuzzyBrand || msg.includes("smart"))) {
    if (fuzzyBrand) {
      const compatibleApps = apps?.filter((a: any) => a.device_category?.toLowerCase().includes('tv') && a.device_category?.toLowerCase().includes('smart'));
      response = `Ótimo, uma Smart TV ${fuzzyBrand.toUpperCase()}. Para este modelo, recomendo os seguintes aplicativos:\n\n` +
        (compatibleApps && compatibleApps.length > 0 ? compatibleApps.map((a: any) => `- ${a.app_name}: ${a.description}`).join("\n") : "Infelizmente não encontrei apps específicos cadastrados para este modelo no momento.") +
        "\n\nQual destes você prefere instalar? Posso te passar o passo a passo.";
    } else {
      response = "Entendi, é uma Smart TV. Qual a marca dela? (Samsung, LG, TCL, Philips, etc)";
    }
  } else if (msg.includes("box") || msg.includes("tv box") || msg.includes("android tv") || msg.includes("fire stick") || msg.includes("firestick")) {
    const compatibleApps = apps?.filter((a: any) => a.device_category === 'TV Box');
    response = "Para TV Box Android, temos aplicativos excelentes. Recomendo o " + 
      (compatibleApps?.[0]?.app_name || "nosso app oficial") + ". \n\nVocê sabe qual a versão do Android dela? Geralmente fica em Configurações > Sobre.";
  } else if (msg.includes("iphone") || msg.includes("ios") || msg.includes("apple")) {
    const appleApps = apps?.filter((a: any) => a.device_category === 'iPhone');
    response = "Para iPhone, a melhor opção é o " + (appleApps?.[0]?.app_name || "GSE Smart IPTV") + ". \n\nBasta baixar na App Store. Quer que eu te envie o link ou o tutorial?";
  } else if (msg.includes("passo a passo") || msg.includes("como instalar") || msg.includes("ajuda")) {
    const genericApp = apps?.[0];
    if (genericApp) {
      response = `Para instalar o ${genericApp.app_name}, siga estes passos:\n` + 
        (genericApp.installation_steps as string[]).map((s: string, i: number) => `${i+1}. ${s}`).join("\n");
    } else {
      response = "Para te passar o tutorial de instalação, primeiro me diga qual dispositivo você está usando.";
    }
  } else {
    // FAQ search with fuzzy matching
    let bestFaq = null;
    let highestRating = 0;

    if (Array.isArray(faq)) {
      for (const item of faq) {
        if (!item.keywords) continue;
        const matches = findBestMatch(msg, item.keywords.map((k: string) => k.toLowerCase()));
        if (matches.bestMatch.rating > highestRating) {
          highestRating = matches.bestMatch.rating;
          bestFaq = item;
        }
      }
    }

    if (bestFaq && highestRating > 0.6) {
      response = bestFaq.answer;
    } else if (msg.includes("não entendeu") || msg.includes("como assim")) {
      response = "Peço desculpas. Meu objetivo é qualificar seu atendimento e garantir que você tenha a melhor experiência AJPVIP. Para avançarmos no seu fechamento, poderia me confirmar seu aparelho? (Ex: Smart TV, TV Box ou Celular)";
    } else if (msg.includes("preço") || msg.includes("valor") || msg.includes("quanto custa") || msg.includes("pagar")) {
      response = "Excelente pergunta! Temos planos que cabem no seu bolso com o melhor custo-benefício do mercado. Para eu te recomendar o ideal: você busca apenas para você ou para sua família toda? (Qualificação de Vendas)";
    } else if (msg.includes("caro") || msg.includes("desconto")) {
      response = "Entendo perfeitamente, o valor é importante. Mas pense no conforto de ter todos os canais, filmes e séries sem travamentos 24h por dia. É um investimento em entretenimento de qualidade. Vamos fechar o plano trimestral com desconto?";
    } else {
      response = "Para que eu possa te atender com excelência e aplicar nossas técnicas de suporte consultivo, me diga: qual marca de TV ou aparelho você usa? Estou pronto para configurar seu acesso agora mesmo!";
    }
  }

  // Save to conversation history
  const newHistory = [...(history || []), { role: 'user', content: message }, { role: 'assistant', content: response }];
  
  try {
    // @ts-ignore
    await (supabaseAdmin.from as any)("ai_agent_conversations")
      .upsert({ 
        session_id: sessionId,
        messages: newHistory,
        updated_at: new Date().toISOString()
      }, { onConflict: 'session_id' }).catch((e: any) => console.error("Upsert failed:", e));
  } catch (upsertError) {
    console.error("Error saving conversation history:", upsertError);
  }

  return { response, history: newHistory };
};

export const getConversationsLogic = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  
  try {
    // @ts-ignore
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

export const updateKnowledgeItemLogic = async (type: 'device' | 'app' | 'faq', item: any) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const table = type === 'device' ? 'ai_agent_devices' : type === 'app' ? 'ai_agent_apps' : 'ai_agent_faq';
  
  // @ts-ignore
  const { data, error } = await (supabaseAdmin.from as any)(table).upsert(item).select().single();
  if (error) throw error;
  return data;
};

export const deleteKnowledgeItemLogic = async (type: 'device' | 'app' | 'faq', id: string) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const table = type === 'device' ? 'ai_agent_devices' : type === 'app' ? 'ai_agent_apps' : 'ai_agent_faq';
  
  // @ts-ignore
  const { error } = await (supabaseAdmin.from as any)(table).delete().eq('id', id);
  if (error) throw error;
  return true;
};