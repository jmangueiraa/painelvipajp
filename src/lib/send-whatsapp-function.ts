/**
 * Helper para acionar a Edge Function `send-whatsapp` no Supabase externo
 * assim que o pagamento Pix/cartão for confirmado no portal.
 */
export async function triggerSendWhatsappEdgeFunction(renewalId: string): Promise<boolean> {
  if (!renewalId) {
    console.warn("[send-whatsapp] Chamada ignorada: renewal_id vazio.");
    return false;
  }

  const supabaseUrl = (
    import.meta.env.VITE_SUPABASE_URL ||
    "https://zfafucaxbktpifydecng.supabase.co"
  ).replace(/\/+$/, "");

  const anonKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "sb_publishable_gf1PnxpslEUMrDamFmuWhg_2cSl8FEI";

  const targetUrl = `${supabaseUrl}/functions/v1/send-whatsapp`;

  try {
    console.log("[send-whatsapp] Disparando Edge Function:", {
      url: targetUrl,
      renewal_id: renewalId,
    });

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ renewal_id: renewalId }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.warn(
        `[send-whatsapp] Edge Function retornou status ${response.status}:`,
        errText
      );
      return false;
    }

    const data = await response.json().catch(() => null);
    console.log(
      "[send-whatsapp] WhatsApp acionado com sucesso pela Edge Function:",
      data
    );
    return true;
  } catch (error) {
    console.error("[send-whatsapp] Falha ao acionar Edge Function send-whatsapp:", error);
    return false;
  }
}
