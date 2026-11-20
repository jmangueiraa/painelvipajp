// Supabase Edge Function: fetch-server-credits
// Consulta em tempo real o saldo de créditos da conta no servidor RBOYS (GET /me)
// Lê dinamicamente as credenciais do servidor cadastradas no banco de dados Supabase

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

function resolveMeCandidates(baseUrl: string): string[] {
  const clean = normalizeUrl(baseUrl);
  if (!clean) return [];
  if (clean.endsWith("/v1")) {
    return [`${clean}/me`, `${clean.replace(/\/v1$/, "")}/me`];
  }
  return [`${clean}/v1/me`, `${clean}/me`];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return json({ error: "Ambiente Supabase incompleto (SUPABASE_URL ou SERVICE_ROLE_KEY ausentes)." }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Extração opcional de owner_id / user_id enviado no body ou auth token
    let ownerId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json().catch(() => ({}));
        if (body && typeof body === "object") {
          ownerId = body.user_id ?? body.owner_id ?? null;
        }
      } catch {
        // Ignora caso body seja vazio
      }
    }

    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      const token = authHeader.split(" ")[1];
      if (token && token.length > 30) {
        try {
          const { data: userData } = await supabase.auth.getUser(token);
          if (userData?.user?.id) {
            ownerId = userData.user.id;
          }
        } catch {
          // Token pode ser anônimo
        }
      }
    }

    // 2. Busca as credenciais dinâmicas cadastradas no banco
    let query = supabase
      .from("iptv_server_integrations")
      .select("server_name,base_url,api_key,is_active");

    if (ownerId) {
      query = query.eq("user_id", ownerId);
    }

    const { data: serverRow, error: dbErr } = await query
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dbErr) {
      return json({ error: `Falha ao consultar banco: ${dbErr.message}` }, 500);
    }

    if (!serverRow || !serverRow.base_url || !serverRow.api_key) {
      return json({
        ok: false,
        configured: false,
        server_name: "RBOYS",
        credits: null,
        formatted_credits: "0.00",
        is_low_balance: false,
        error: "Servidor IPTV / P2P não configurado no painel AJPVIP.",
      });
    }

    const baseUrl = normalizeUrl(serverRow.base_url);
    const apiKey = String(serverRow.api_key).trim();
    const serverName = serverRow.server_name || "RBOYS";

    const candidates = resolveMeCandidates(baseUrl);
    let lastError: any = null;
    const startTime = Date.now();

    for (const targetUrl of candidates) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(targetUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
            Authorization: `Bearer ${apiKey}`,
          },
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        if (res.status === 401 || res.status === 403) {
          return json({
            ok: false,
            configured: true,
            server_name: serverName,
            error: `Chave API (X-API-Key) não autorizada pelo servidor (HTTP ${res.status}).`,
          }, 401);
        }

        if (res.status === 404 && targetUrl !== candidates[candidates.length - 1]) {
          continue;
        }

        if (res.ok) {
          const latencyMs = Date.now() - startTime;
          const data = await res.json().catch(() => null);
          const accountObj = (data && typeof data === "object"
            ? (data.data || data.user || data.account || data.reseller || data)
            : {}) as Record<string, any>;

          let credits: number | string | null = null;
          if (accountObj.credits !== undefined && accountObj.credits !== null) credits = accountObj.credits;
          else if (accountObj.credit !== undefined && accountObj.credit !== null) credits = accountObj.credit;
          else if (accountObj.balance !== undefined && accountObj.balance !== null) credits = accountObj.balance;
          else if (accountObj.saldo !== undefined && accountObj.saldo !== null) credits = accountObj.saldo;
          else if (accountObj.points !== undefined && accountObj.points !== null) credits = accountObj.points;

          let creditsNum: number | null = null;
          if (credits !== null && credits !== undefined) {
            const parsed = typeof credits === "number" ? credits : parseFloat(String(credits).replace(",", "."));
            if (!isNaN(parsed)) creditsNum = parsed;
          }

          const formatted = creditsNum != null ? creditsNum.toFixed(2) : "0.00";
          const isLow = creditsNum != null && creditsNum < 5;

          const name = String(accountObj.name || accountObj.nome || "").trim();
          const username = String(accountObj.username || accountObj.usuario || accountObj.login || accountObj.user || "").trim();
          const email = String(accountObj.email || "").trim();
          const activeClients = accountObj.active_clients ?? accountObj.clients_count ?? accountObj.total_clients ?? null;

          return json({
            ok: true,
            configured: true,
            server_name: serverName,
            base_url: baseUrl,
            endpoint: targetUrl,
            status: res.status,
            latencyMs,
            credits: creditsNum,
            formatted_credits: formatted,
            is_low_balance: isLow,
            balance: accountObj.balance ?? null,
            name: name || null,
            username: username || null,
            email: email || null,
            active_clients: activeClients != null ? Number(activeClients) : null,
            raw: data,
          });
        }

        const errBody = await res.json().catch(() => ({}));
        const serverErrMsg = (errBody && (errBody.message || errBody.error)) || `HTTP ${res.status}`;
        throw new Error(`Servidor respondeu ${serverErrMsg} ao consultar ${targetUrl}`);
      } catch (err: any) {
        lastError = err;
        if (targetUrl !== candidates[candidates.length - 1]) {
          continue;
        }
      }
    }

    return json({
      ok: false,
      configured: true,
      server_name: serverName,
      credits: null,
      formatted_credits: "0.00",
      is_low_balance: false,
      error: lastError?.message || "Falha ao consultar créditos no servidor.",
    }, 502);
  } catch (error: any) {
    return json({ error: error?.message || "Erro interno na Edge Function" }, 500);
  }
});
