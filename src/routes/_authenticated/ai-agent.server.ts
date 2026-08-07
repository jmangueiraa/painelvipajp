import { z } from "zod";

export const getAgentKnowledgeLogic = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  
  const { data: devices, error: devError } = await (supabaseAdmin.from as any)("ai_agent_devices").select("*");
  if (devError) console.error("Error fetching devices:", devError);
  
  const { data: apps, error: appError } = await (supabaseAdmin.from as any)("ai_agent_apps").select("*").eq("is_active", true);
  if (appError) console.error("Error fetching apps:", appError);
  
  const { data: faq, error: faqError } = await (supabaseAdmin.from as any)("ai_agent_faq").select("*");
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

  const { data: devices, error: devError } = await (supabaseAdmin.from as any)("ai_agent_devices").select("*");
  const { data: apps, error: appError } = await (supabaseAdmin.from as any)("ai_agent_apps").select("*").eq("is_active", true);
  const { data: faq, error: faqError } = await (supabaseAdmin.from as any)("ai_agent_faq").select("*");

  if (devError || appError || faqError) {
    console.error("Database fetch error in processAgentMessage:", { devError, appError, faqError });
  }

  const msg = message.toLowerCase();
  let response = "";

  // Very basic NLP simulation for the specialized agent
  if (msg.includes("olá") || msg.includes("bom dia") || msg.includes("boa tarde") || msg.includes("oi") || msg.trim() === "") {
    response = "Olá! Sou seu assistente de instalação AJP. Como posso ajudar você hoje? Qual seu nome e qual dispositivo você pretende usar?";
  } else if (msg.includes("tv") && (msg.includes("smart") || msg.includes("samsung") || msg.includes("lg") || msg.includes("tcl") || msg.includes("philips") || msg.includes("sony") || msg.includes("aoc") || msg.includes("hisense") || msg.includes("philco"))) {
    const brands = ["samsung", "lg", "tcl", "philips", "sony", "aoc", "hisense", "philco"];
    const brand = brands.find(b => msg.includes(b));
    if (brand) {
      const compatibleApps = apps?.filter((a: any) => a.device_category?.toLowerCase().includes('tv') && a.device_category?.toLowerCase().includes('smart'));
      response = `Ótimo, uma Smart TV ${brand.toUpperCase()}. Para este modelo, recomendo os seguintes aplicativos:\n\n` +
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
    // FAQ search
    const faqMatch = faq?.find((f: any) => f.keywords?.some((k: string) => msg.includes(k.toLowerCase())));
    if (faqMatch) {
      response = faqMatch.answer;
    } else if (msg.includes("não entendeu") || msg.includes("como assim")) {
      response = "Peço desculpas pela confusão. Às vezes me perco um pouco! Para que eu possa ser mais assertivo, você poderia me confirmar qual a marca e o modelo do seu aparelho? Por exemplo: Smart TV Samsung, TV Box Android ou iPhone.";
    } else {
      response = "Desculpe, não entendi perfeitamente. Pode me dizer qual dispositivo você está usando? Assim consigo te indicar o melhor aplicativo e o tutorial correto.";
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
      }, { onConflict: 'session_id' });
  } catch (upsertError) {
    console.error("Error saving conversation history:", upsertError);
  }

  return { response, history: newHistory };
};

export const getConversationsLogic = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // @ts-ignore
  const { data } = await (supabaseAdmin.from as any)("ai_agent_conversations")
    .select("*, clients(name)")
    .order("updated_at", { ascending: false });
  return data || [];
};
