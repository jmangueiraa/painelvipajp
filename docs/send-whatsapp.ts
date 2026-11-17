// Código completo para colar no index.ts da Edge Function externa `send-whatsapp`.
// Suporta CORS (preflight OPTIONS e POST do frontend ou backend).
// Consulta o Mercado Pago pelo mp_payment_id usando o token de produção e retorna o valor líquido real (net_received_amount).

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

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
    },
  });

function formatBRL(amount: number): string {
  return amount.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export async function handleSendWhatsApp(
  request: Request,
  env: Env,
  send: typeof fetch = fetch
): Promise<Response> {
  // Trata preflight CORS do navegador
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const dbUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_ANON_KEY");
  if (!dbUrl || !serviceKey) {
    return json({ error: "server_not_configured" }, 503);
  }

  try {
    const raw = await request.text();
    if (raw.length > 4096) return json({ error: "payload_too_large" }, 413);

    let body: Row;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      typeof body.renewal_id !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(body.renewal_id)
    ) {
      return json({ error: "invalid_renewal_id" }, 400);
    }

    const dbHeaders: Record<string, string> = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    async function queryOne(
      table: string,
      select: string,
      filters: Record<string, string>
    ): Promise<Row | null> {
      const endpoint = new URL(`/rest/v1/${table}`, dbUrl);
      endpoint.searchParams.set("select", select);
      endpoint.searchParams.set("limit", "1");
      for (const [k, v] of Object.entries(filters)) {
        endpoint.searchParams.set(k, `eq.${v}`);
      }
      const resp = await send(endpoint, {
        headers: dbHeaders,
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) throw new Error(`db_failed_${table}_${resp.status}`);
      const data = await resp.json();
      return Array.isArray(data) && data.length > 0 ? data[0] : null;
    }

    // 1. Localiza a renovação
    const renewal = await queryOne(
      "renewal_requests",
      "id,user_id,client_id,buyer_id,status,mp_status,days,amount_cents,label,mp_payment_id",
      { id: body.renewal_id }
    );

    if (!renewal) return json({ error: "renewal_not_found" }, 404);
    if (!renewal.user_id) return json({ error: "owner_missing" }, 409);

    const owner = String(renewal.user_id);

    // 2. Localiza os dados do cliente
    const contact = renewal.client_id
      ? await queryOne("clients", "name,phone,iptv_login", {
          id: String(renewal.client_id),
          user_id: owner,
        })
      : renewal.buyer_id
        ? await queryOne("store_buyers", "name,phone", {
            id: String(renewal.buyer_id),
            user_id: owner,
          })
        : null;

    if (!contact?.phone) {
      return json({ ok: true, whatsapp: "client_phone_missing" });
    }

    // 3. Localiza as credenciais da Evolution API
    const config = await queryOne(
      "evolution_integrations",
      "base_url,instance_name,api_key",
      { user_id: owner }
    );

    if (!config || !config.base_url || !config.instance_name || !config.api_key) {
      return json({ ok: true, whatsapp: "owner_evolution_not_configured" });
    }

    // 4. Consulta o Mercado Pago para obter o VALOR LÍQUIDO REAL da transação
    let valorBruto = Number(renewal.amount_cents ?? 0) / 100;
    let taxaMp = 0;
    let valorLiquido = valorBruto;
    let mpConsultado = false;

    // Busca o token do Mercado Pago salvo em settings
    const settings = await queryOne("settings", "mp_access_token", {
      user_id: owner,
    });
    const mpToken = String(
      settings?.mp_access_token || env("MP_ACCESS_TOKEN") || ""
    ).trim();

    if (mpToken && renewal.mp_payment_id) {
      try {
        const mpRes = await send(
          `https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(renewal.mp_payment_id))}`,
          {
            headers: {
              Authorization: `Bearer ${mpToken}`,
            },
            signal: AbortSignal.timeout(15000),
          }
        );

        if (mpRes.ok) {
          const payment = await mpRes.json();
          mpConsultado = true;

          if (typeof payment.transaction_amount === "number") {
            valorBruto = payment.transaction_amount;
          }

          // net_received_amount é o valor líquido creditado na conta pelo MP
          if (payment.transaction_details?.net_received_amount != null) {
            valorLiquido = Number(payment.transaction_details.net_received_amount);
            taxaMp = Math.max(0, Number((valorBruto - valorLiquido).toFixed(2)));
          } else if (Array.isArray(payment.fee_details) && payment.fee_details.length > 0) {
            taxaMp = payment.fee_details.reduce(
              (acc: number, f: any) => acc + Number(f.amount || 0),
              0
            );
            valorLiquido = Math.max(0, Number((valorBruto - taxaMp).toFixed(2)));
          }
        } else {
          console.warn("[send-whatsapp] Mercado Pago HTTP", mpRes.status);
        }
      } catch (err) {
        console.error("[send-whatsapp] Erro ao consultar pagamento MP:", err);
      }
    }

    // 5. Monta a mensagem para WhatsApp
    let destinationNumber: string;
    try {
      destinationNumber = normalizeBrazilPhone(String(contact.phone));
    } catch {
      return json({ error: "invalid_client_phone" }, 422);
    }

    const clientName = contact.name || "adm";
    const clientUser = contact.iptv_login || contact.name || "adm";
    const clientPhoneFormatted = String(contact.phone);
    const dias = renewal.days && Number(renewal.days) > 0 ? renewal.days : 30;

    const messageLines = [
      "💰 NOVA RENOVAÇÃO RECEBIDA — AJP VIP",
      "",
      `👤 Cliente: ${clientName}`,
      `🔑 Usuário: ${clientUser}`,
      `📱 WhatsApp: ${clientPhoneFormatted}`,
      `💵 Valor bruto: R$ ${formatBRL(valorBruto)}`,
      taxaMp > 0 ? `🏷️ Taxa MP: R$ ${formatBRL(taxaMp)}` : null,
      `💚 Valor líquido MP: R$ ${formatBRL(valorLiquido)}`,
      `⌛ Período: +${dias} dias`,
    ].filter(Boolean);

    const messageText = messageLines.join("\n");

    // 6. Envia mensagem via Evolution API
    const base = new URL(String(config.base_url).trim());
    const instance = String(config.instance_name).trim();
    const evoUrl = `${base.toString().replace(/\/+$/, "")}/message/sendText/${encodeURIComponent(instance)}`;

    const evoResp = await send(evoUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        apikey: String(config.api_key),
      },
      body: JSON.stringify({
        number: destinationNumber,
        text: messageText,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const evoResult = await evoResp.json().catch(() => null);

    if (!evoResp.ok || !evoResult || evoResult.error) {
      console.error("[send-whatsapp] Evolution API falhou:", evoResp.status);
      return json({ error: "evolution_delivery_failed" }, 502);
    }

    // 7. Atualiza whatsapp_sent_at na renovação
    try {
      const updateUrl = new URL("/rest/v1/renewal_requests", dbUrl);
      updateUrl.searchParams.set("id", `eq.${renewal.id}`);
      await send(updateUrl, {
        method: "PATCH",
        headers: dbHeaders,
        body: JSON.stringify({
          whatsapp_sent_at: new Date().toISOString(),
        }),
      });
    } catch {
      /* não impede retorno de sucesso */
    }

    return json({
      ok: true,
      whatsapp: "accepted",
      mp_consultado: mpConsultado,
      valor_bruto: valorBruto,
      taxa_mp: taxaMp,
      valor_liquido: valorLiquido,
    });
  } catch (e) {
    console.error("[send-whatsapp] Erro interno:", e);
    return json({ error: "whatsapp_failed" }, 502);
  }
}

if (import.meta.main) {
  Deno.serve((request) => handleSendWhatsApp(request, (name) => Deno.env.get(name)));
}
