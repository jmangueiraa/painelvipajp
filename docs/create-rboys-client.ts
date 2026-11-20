// Supabase Edge Function: create-rboys-client
// Criação de clientes / testes diretamente no servidor RBOYS e vínculo com o AJPVIP
// Consulta dinamicamente as credenciais cadastradas no banco de dados Supabase

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

function normalizeUrl(raw: string): string {
  let url = (raw || "").trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
}

function parseRboysDate(raw: any) {
  if (!raw || raw === "0" || raw === "0000-00-00" || raw === "null") {
    return {
      iso: null,
      dueDateStr: null,
      formattedDate: "Sem vencimento",
      displayDue: "Sem vencimento",
      isExpired: false,
    };
  }

  const todayBrasilia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const str = String(raw).trim();
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2];
    const day = isoMatch[3];
    const hour = isoMatch[4] || "";
    const minute = isoMatch[5] || "";

    const dueDateStr = `${year}-${month}-${day}`;
    const formattedDate = `${day}/${month}/${year}`;
    const formattedTime = hour && minute ? `${hour}:${minute}` : "";
    const displayDue = formattedTime ? `${formattedDate} ${formattedTime}` : formattedDate;
    const isExpired = dueDateStr < todayBrasilia;

    return {
      iso: str,
      dueDateStr,
      formattedDate,
      displayDue,
      isExpired,
    };
  }

  return {
    iso: str,
    dueDateStr: null,
    formattedDate: str,
    displayDue: str,
    isExpired: false,
  };
}

function buildFallbackMessage(data: {
  name: string;
  username: string;
  password: string;
  type: string;
  is_trial: boolean;
  display_due: string;
  dns?: string;
  server_name?: string;
}) {
  const modalidade = data.is_trial ? "TESTE GRATUITO" : "ACESSO OFICIAL";
  return [
    `🎉 *SEU ACESSO ${data.type} ESTÁ PRONTO!* (${modalidade})`,
    ``,
    `Olá *${data.name}*, seus dados de acesso ao servidor foram gerados com sucesso:`,
    ``,
    `👤 *Usuário:* \`${data.username}\``,
    `🔑 *Senha:* \`${data.password}\``,
    `📅 *Vencimento:* *${data.display_due}*`,
    data.dns ? `🌐 *Servidor / DNS:* \`${data.dns}\`` : null,
    ``,
    `📱 *Aplicativos recomendados:*`,
    `Acesse nosso portal para instruções e download dos apps:`,
    `👉 https://portalajp.com.br`,
    ``,
    `Qualquer dúvida estamos à disposição! 🚀`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Variáveis de ambiente do Supabase não configuradas." }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Lê credenciais dinamicamente
  const { data: serverRow } = await supabase
    .from("iptv_server_integrations")
    .select("server_name, base_url, api_key")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let serverName = serverRow?.server_name || "RBOYS";
  let baseUrl = normalizeUrl(serverRow?.base_url || "");
  let apiKey = serverRow?.api_key?.trim() || "";

  if (!baseUrl || !apiKey) {
    const { data: s } = await supabase
      .from("settings")
      .select("iptv_server_name, iptv_api_url, iptv_api_key")
      .limit(1)
      .maybeSingle();

    if (s?.iptv_api_url && s?.iptv_api_key) {
      serverName = s.iptv_server_name || serverName;
      baseUrl = normalizeUrl(s.iptv_api_url);
      apiKey = s.iptv_api_key.trim();
    }
  }

  if (!baseUrl || !apiKey) {
    return json({ error: "Servidor IPTV / P2P não configurado no banco." }, 400);
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
    Authorization: `Bearer ${apiKey}`,
  };

  const body = (await req.json().catch(() => ({}))) as Record<string, any>;

  // Rota de busca de planos
  if (body.action === "get_plans" || req.method === "GET") {
    const type = body.type || "IPTV";
    const endpoint = type === "P2P" ? "/p2p/plans" : "/iptv/plans";
    try {
      const res = await fetch(`${baseUrl}${endpoint}`, { headers });
      const data = await res.json().catch(() => ({}));
      return json({ ok: true, server_name: serverName, data });
    } catch (e: any) {
      return json({ error: `Falha ao buscar planos: ${e.message}` }, 500);
    }
  }

  // Criação de cliente
  const name = String(body.name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const type = body.type === "P2P" ? "P2P" : "IPTV";
  const isTrial = Boolean(body.is_trial);
  const planId = body.plan_id;

  if (!name || name.length < 2) return json({ error: "Informe o nome do cliente." }, 400);
  if (!phone || phone.length < 8) return json({ error: "Informe o WhatsApp do cliente." }, 400);

  const endpoint = type === "P2P" ? "/p2p/clients" : "/iptv/clients";
  const payload: Record<string, any> = {
    name,
    notes: body.notes ? String(body.notes).trim() : undefined,
  };
  if (planId) {
    payload.plan_id = planId;
    payload.package_id = planId;
  }
  if (body.username) payload.username = String(body.username).trim();
  if (body.password) payload.password = String(body.password).trim();
  if (isTrial) {
    payload.is_trial = true;
    payload.trial = true;
  }

  let resData: any = null;
  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    resData = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = resData?.message || resData?.error || `HTTP ${res.status}`;
      return json({ error: `Erro no servidor ${serverName}: ${errMsg}` }, 400);
    }
  } catch (err: any) {
    return json({ error: `Erro de rede ao conectar com o servidor: ${err.message}` }, 500);
  }

  const clientObj = resData?.data || resData?.client || resData;
  const serverClientId = clientObj.id ?? clientObj.client_id ?? clientObj.user_id;
  const username = String(clientObj.username ?? clientObj.login ?? body.username ?? `user_${serverClientId}`).trim();
  const password = String(clientObj.password ?? clientObj.senha ?? body.password ?? "").trim();
  const rawExpiry = clientObj.expires_at ?? clientObj.exp_date ?? clientObj.expiration ?? clientObj.due_date;
  const parsed = parseRboysDate(rawExpiry);
  const dns = clientObj.dns || clientObj.server_url || clientObj.host || undefined;

  let message = clientObj.message || clientObj.text || clientObj.whatsapp_message;
  if (!message || typeof message !== "string" || !message.trim()) {
    message = buildFallbackMessage({
      name,
      username,
      password,
      type,
      is_trial: isTrial,
      display_due: parsed.displayDue,
      dns,
      server_name: serverName,
    });
  }

  const { data: adminRow } = await supabase.from("profiles").select("id").limit(1).maybeSingle();
  const ownerId = adminRow?.id;

  if (ownerId) {
    const notesText = body.notes
      ? `${body.notes} | [${serverName} ${type}] ID: ${serverClientId}`
      : `Criado no servidor ${serverName} (${type}) | ID: ${serverClientId}`;

    const baseRecord: Record<string, any> = {
      user_id: ownerId,
      name,
      phone,
      iptv_login: username,
      iptv_password: password,
      due_date: parsed.dueDateStr,
      status: parsed.isExpired ? "vencido" : "ativo",
      price_cents: body.price_cents !== undefined ? Number(body.price_cents) : (isTrial ? 0 : 3000),
      auto_charge: !isTrial,
      points: 1,
      notes: notesText,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const fullRecord = {
      ...baseRecord,
      server_client_id: String(serverClientId),
      server_plan_id: planId ? String(planId) : null,
      service_type: type.toLowerCase(),
    };

    const { error: insErr } = await supabase.from("clients").insert(fullRecord);
    if (insErr) {
      await supabase.from("clients").insert(baseRecord);
    }
  }

  return json({
    ok: true,
    server_client_id: serverClientId,
    username,
    password,
    type,
    is_trial: isTrial,
    expires_at: parsed.iso,
    display_due: parsed.displayDue,
    due_date_str: parsed.dueDateStr,
    message: message.trim(),
    dns,
    server_name: serverName,
  });
});
