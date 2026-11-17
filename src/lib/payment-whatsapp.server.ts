// Called only after the central finalizer atomically claims an approved payment.
export async function invokePaymentWhatsApp(renewalId: string, send: typeof fetch = fetch): Promise<string> {
  const { resolveSupabaseAdminConfig } = await import("@/integrations/supabase/client.server");
  const { url, key } = resolveSupabaseAdminConfig(process.env);
  const headers: Record<string, string> = { "Content-Type": "application/json", apikey: key };
  if (!key.startsWith("sb_")) headers.Authorization = `Bearer ${key}`;
  const response = await send(new URL("/functions/v1/send-whatsapp", url), {
    method: "POST", headers, redirect: "manual",
    body: JSON.stringify({ renewal_id: renewalId }), signal: AbortSignal.timeout(60000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) throw new Error(`send-whatsapp HTTP ${response.status}`);
  return typeof result.whatsapp === "string" ? result.whatsapp : "accepted";
}