// Adaptador completo para colar no index.ts da Edge Function externa mp-webhook.
// Mantém a renovação, Telegram, comissões e push no processador publicado do portal.
// Não contém chaves reais. Consulte mp-webhook-evolution.md antes de publicar.
type Env = (name: string) => string | undefined;
type Fetch = typeof fetch;
type Row = Record<string, any>;
declare const Deno: { env: { get: Env }; serve: (handler: (request: Request) => Promise<Response>) => void };

export function normalizeBrazilPhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0055")) digits = digits.slice(2);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (!/^55[1-9]\d{9,10}$/.test(digits)) throw new Error("invalid_client_phone");
  return digits;
}

export function evolutionSendRequest(config: Row, phone: string, text: string) {
  const base = new URL(String(config.base_url).trim());
  const host = base.hostname.toLowerCase();
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash ||
      !host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) throw new Error("invalid_evolution_url");
  const instance = String(config.instance_name).trim();
  if (!/^[a-zA-Z0-9_ -]{1,100}$/.test(instance) || !config.api_key) throw new Error("invalid_evolution_config");
  return {
    url: `${base.toString().replace(/\/+$/, "")}/message/sendText/${encodeURIComponent(instance)}`,
    init: {
      method: "POST", redirect: "manual" as const,
      headers: { "Content-Type": "application/json", apikey: String(config.api_key) },
      body: JSON.stringify({ number: normalizeBrazilPhone(phone), text }),
      signal: AbortSignal.timeout(15000),
    },
  };
}

export async function verifyMpSignature(request: Request, paymentId: string, secret: string): Promise<boolean> {
  const signature = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";
  const parts: Record<string, string> = Object.fromEntries(signature.split(",").map(part => part.trim().split("=")));
  if (!requestId || !/^\d{1,20}$/.test(parts.ts || "") || !/^[a-f0-9]{64}$/i.test(parts.v1 || "")) return false;
  const manifest = `id:${paymentId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const bytes = new Uint8Array(parts.v1.match(/.{2}/g)?.map(hex => parseInt(hex, 16)) || []);
  return crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(manifest));
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function handleWebhook(request: Request, env: Env, send: Fetch = fetch): Promise<Response> {
  if (request.method === "GET") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const url = new URL(request.url);
    const raw = await request.text();
    if (raw.length > 65536) return json({ error: "payload_too_large" }, 413);
    let body: Row;
    try { body = raw ? JSON.parse(raw) : {}; } catch { return json({ error: "invalid_json" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_payload" }, 400);
    if (body.type && body.type !== "payment") return json({ ok: true, skipped: "non_payment" });
    // A assinatura do Mercado Pago usa data.id da URL; não trocar pelo id do evento.
    const id = url.searchParams.get("data.id") || String(body.data?.id || "");
    if (!/^\d{1,30}$/.test(id)) return json({ error: "invalid_payment_id" }, 400);
    if (body.data?.id && String(body.data.id) !== id) return json({ error: "payment_id_mismatch" }, 400);
    const secret = env("MP_WEBHOOK_SECRET");
    if (!secret) return json({ error: "webhook_secret_not_configured" }, 503);
    if (!await verifyMpSignature(request, id, secret)) return json({ error: "invalid_signature" }, 401);

    const dbUrl = env("SUPABASE_URL");
    const dbKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const processorUrl = env("PORTAL_PAYMENT_PROCESSOR_URL");
    if (!dbUrl || !dbKey || !processorUrl) return json({ error: "server_not_configured" }, 503);
    const processor = new URL(processorUrl);
    if (processor.protocol !== "https:" || processor.pathname !== "/api/public/portal/mp-webhook" || processor.search || processor.hash || processor.username || processor.password)
      return json({ error: "invalid_processor_url" }, 503);

    // Todas as consultas são feitas no banco desta função, nunca com chave pública.
    const dbHeaders: Record<string, string> = { apikey: dbKey, "Content-Type": "application/json" };
    if (!dbKey.startsWith("sb_secret_")) dbHeaders.Authorization = `Bearer ${dbKey}`;
    async function one(table: string, fields: string, filters: Record<string, string>): Promise<Row | null> {
      const endpoint = new URL(`/rest/v1/${table}`, dbUrl);
      endpoint.searchParams.set("select", fields);
      endpoint.searchParams.set("limit", "2");
      for (const [field, value] of Object.entries(filters)) endpoint.searchParams.set(field, `eq.${value}`);
      const response = await send(endpoint, { headers: dbHeaders, redirect: "manual", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`database_${table}_http_${response.status}`);
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length > 1) throw new Error(`ambiguous_${table}`);
      return rows[0] || null;
    }

    const ref = url.searchParams.get("external_reference");
    if (ref && !/^[a-f0-9-]{36}$/i.test(ref)) return json({ error: "invalid_reference" }, 400);
    const renewal = await one("renewal_requests", "id,user_id,client_id,buyer_id,days,amount_cents,label,status,mp_payment_id", ref ? { id: ref } : { mp_payment_id: id });
    if (!renewal) return json({ ok: true, skipped: "renewal_not_found" });
    if (!renewal.user_id) return json({ error: "renewal_owner_missing" }, 409);
    const owner = String(renewal.user_id);
    const settings = await one("settings", "mp_access_token", { user_id: owner });
    if (!settings?.mp_access_token) return json({ error: "owner_mp_not_configured" }, 503);
    const mp = await send(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: { Authorization: `Bearer ${String(settings.mp_access_token).trim()}` },
      redirect: "manual", signal: AbortSignal.timeout(15000),
    });
    if (!mp.ok) return json({ error: "mp_lookup_failed" }, 502);
    const payment = await mp.json();
    if (String(payment.id) !== id || payment.external_reference !== renewal.id ||
        (renewal.mp_payment_id && String(renewal.mp_payment_id) !== id) ||
        (renewal.amount_cents != null && Math.round(Number(payment.transaction_amount) * 100) !== Number(renewal.amount_cents)))
      return json({ error: "payment_mismatch" }, 409);

    // Reutiliza o fluxo original: não duplica renovação, Telegram, compras, comissões ou push.
    processor.searchParams.set("data.id", id);
    processor.searchParams.set("external_reference", renewal.id);
    const processed = await send(processor, {
      method: "POST", redirect: "manual",
      headers: { "Content-Type": "application/json", "x-signature": request.headers.get("x-signature") || "", "x-request-id": request.headers.get("x-request-id") || "" },
      body: JSON.stringify({ type: "payment", data: { id } }), signal: AbortSignal.timeout(45000),
    });
    const result = await processed.json().catch(() => null);
    if (!processed.ok || !result?.ok) return json({ error: "portal_processing_failed" }, 502);
    if (payment.status !== "approved") return json({ ok: true, skipped: "not_approved" });
    // O processador já faz a disputa atômica contra polling e webhooks repetidos.
    // Sem uma fila de entrega persistente, não reenviar quando já processado.
    if (result.skipped) return json({ ok: true, skipped: String(result.skipped) });
    // Portal atualizado já chama send-whatsapp também no polling/cartão.
    // Não duplicar a mensagem aqui, inclusive quando a tentativa falhou.
    if (typeof result.whatsapp === "string") return json({ ok: true, whatsapp: result.whatsapp });
    const paid = await one("renewal_requests", "status", { id: renewal.id, user_id: owner });
    if (paid?.status !== "paid") return json({ error: "renewal_not_paid" }, 409);

    const contact = renewal.client_id
      ? await one("clients", "name,phone", { id: renewal.client_id, user_id: owner })
      : renewal.buyer_id ? await one("store_buyers", "name,phone", { id: renewal.buyer_id, user_id: owner }) : null;
    if (!contact?.phone) return json({ ok: true, whatsapp: "client_phone_missing" });
    const config = await one("evolution_integrations", "base_url,instance_name,api_key", { user_id: owner });
    if (!config) return json({ ok: true, whatsapp: "owner_evolution_not_configured" });
    const amount = (Number(renewal.amount_cents ?? Math.round(Number(payment.transaction_amount) * 100)) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const text = `✅ Pagamento confirmado!\n\nOlá, ${contact.name || "cliente"}! Recebemos seu pagamento de ${amount}.\n${Number(renewal.days) > 0 ? "Seu plano foi renovado." : "Seu pedido foi confirmado."}\nNão há necessidade de enviar comprovante.\n\nAJP VIP`;
    const evolution = evolutionSendRequest(config, String(contact.phone), text);
    const delivered = await send(evolution.url, evolution.init);
    const deliveryBody = await delivered.json().catch(() => null);
    if (!delivered.ok || !deliveryBody || deliveryBody.error) {
      // Não imprimir chave, telefone, mensagem ou resposta da Evolution nos logs.
      console.error("[mp-webhook] Evolution delivery failed", delivered.status);
      return json({ ok: true, whatsapp: "failed", retry_requires_manual_action: true });
    }
    return json({ ok: true, whatsapp: "accepted" });
  } catch {
    console.error("[mp-webhook] Processing failed; check database, processor and Evolution configuration.");
    return json({ error: "processing_failed" }, 500);
  }
}

if (import.meta.main) Deno.serve(request => handleWebhook(request, name => Deno.env.get(name)));