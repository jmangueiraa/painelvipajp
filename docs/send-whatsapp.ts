// Código completo: cole no index.ts da Edge Function externa send-whatsapp.
// Somente chamadas administrativas do servidor; nunca use a service_role no navegador.
type Env = (name: string) => string | undefined;
type Row = Record<string, any>;
declare const Deno: { env: { get: Env }; serve: (handler: (request: Request) => Promise<Response>) => void };

export function normalizeBrazilPhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0055")) digits = digits.slice(2);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (!/^55[1-9]\d{9,10}$/.test(digits)) throw new Error("invalid_phone");
  return digits;
}

function equalSecret(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a), right = new TextEncoder().encode(b);
  let difference = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) difference |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return difference === 0;
}

const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

export async function handleSendWhatsApp(request: Request, env: Env, send: typeof fetch = fetch): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const dbUrl = env("SUPABASE_URL"), key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!dbUrl || !key) return json({ error: "server_not_configured" }, 503);
  // verify_jwt=false NÃO permite acesso público: esta validação é obrigatória.
  const bearer = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const supplied = request.headers.get("apikey") ?? bearer;
  if (!supplied || !equalSecret(supplied, key)) return json({ error: "unauthorized" }, 401);
  try {
    const raw = await request.text();
    if (raw.length > 4096) return json({ error: "payload_too_large" }, 413);
    let body: Row;
    try { body = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        typeof body.renewal_id !== "string" || !/^[a-f0-9-]{36}$/i.test(body.renewal_id))
      return json({ error: "invalid_renewal_id" }, 400);

    const headers: Record<string, string> = { apikey: key };
    if (!key.startsWith("sb_")) headers.Authorization = `Bearer ${key}`;
    async function one(table: string, select: string, filters: Record<string, string>): Promise<Row | null> {
      const url = new URL(`/rest/v1/${table}`, dbUrl);
      url.searchParams.set("select", select);
      url.searchParams.set("limit", "2");
      for (const [field, value] of Object.entries(filters)) url.searchParams.set(field, `eq.${value}`);
      const response = await send(url, { headers, redirect: "manual", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("database_failed");
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length > 1) throw new Error("invalid_database_result");
      return rows[0] ?? null;
    }

    // Derive proprietário, telefone e mensagem do pagamento persistido, nunca do navegador.
    const renewal = await one("renewal_requests", "id,user_id,client_id,buyer_id,status,mp_status,days,amount_cents,label", { id: body.renewal_id });
    if (!renewal) return json({ error: "renewal_not_found" }, 404);
    if (renewal.status !== "paid" || renewal.mp_status !== "approved") return json({ error: "payment_not_approved" }, 409);
    if (!renewal.user_id) return json({ error: "owner_missing" }, 409);
    const owner = String(renewal.user_id);
    const contact = renewal.client_id
      ? await one("clients", "name,phone", { id: String(renewal.client_id), user_id: owner })
      : renewal.buyer_id ? await one("store_buyers", "name,phone", { id: String(renewal.buyer_id), user_id: owner }) : null;
    if (!contact?.phone) return json({ ok: true, whatsapp: "client_phone_missing" });
    const config = await one("evolution_integrations", "base_url,instance_name,api_key", { user_id: owner });
    if (!config) return json({ ok: true, whatsapp: "owner_evolution_not_configured" });

    const base = new URL(String(config.base_url).trim());
    const host = base.hostname.toLowerCase();
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash ||
        !host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") ||
        /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) return json({ error: "invalid_evolution_url" }, 422);
    const instance = String(config.instance_name).trim();
    if (!/^[a-zA-Z0-9_ -]{1,100}$/.test(instance) || !config.api_key) return json({ error: "invalid_evolution_config" }, 422);
    let number: string;
    try { number = normalizeBrazilPhone(String(contact.phone)); } catch { return json({ error: "invalid_client_phone" }, 422); }
    const amount = (Number(renewal.amount_cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const text = `✅ Pagamento confirmado!\n\nOlá, ${contact.name || "cliente"}! Recebemos seu pagamento de ${amount}.\n${Number(renewal.days) > 0 ? "Seu plano foi renovado." : "Seu pedido foi confirmado."}\nNão há necessidade de enviar comprovante.\n\nAJP VIP`;
    const response = await send(`${base.toString().replace(/\/+$/, "")}/message/sendText/${encodeURIComponent(instance)}`, {
      method: "POST", redirect: "manual",
      headers: { "Content-Type": "application/json", apikey: String(config.api_key) },
      body: JSON.stringify({ number, text }), signal: AbortSignal.timeout(15000),
    });
    const result = await response.json().catch(() => null);
    // Não retorna nem registra credenciais, contato ou resposta privada da Evolution.
    if (!response.ok || !result || result.error) return json({ error: "evolution_delivery_failed" }, 502);
    return json({ ok: true, whatsapp: "accepted" });
  } catch {
    console.error("[send-whatsapp] Falha na consulta ou envio; nenhuma credencial foi registrada.");
    return json({ error: "whatsapp_failed" }, 502);
  }
}

if (import.meta.main) Deno.serve(request => handleSendWhatsApp(request, name => Deno.env.get(name)));