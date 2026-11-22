import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeIptvBaseUrl,
  buildIptvHeaders,
  normalizeServerClientItem,
  sortServerClientsByDue,
  normalizeServerConnection,
  normalizeServerPlan,
  buildFallbackClientAccessMessage,
  parseRboysDate,
  type IptvServerConfig,
  type NormalizedServerClient,
  type NormalizedServerConnection,
  type NormalizedServerPlan,
  type CreateServerClientInput,
  type CreatedServerClientResult,
  type ServerTestResult,
  type ServerAccountDetails,
  type ServerCreditsSummary,
} from "./iptv-server-api";

export async function getIptvServerConfig(userId?: string): Promise<IptvServerConfig | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1. Tenta carregar da tabela dedicada iptv_server_integrations
  try {
    let query = (supabaseAdmin as SupabaseClient)
      .from("iptv_server_integrations")
      .select("server_name,base_url,api_key,is_active");

    if (userId) {
      query = query.eq("user_id", userId);
    }
    const { data, error } = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();

    if (!error && data?.base_url && data?.api_key) {
      return {
        server_name: data.server_name || "RBOYS",
        base_url: normalizeIptvBaseUrl(data.base_url),
        api_key: data.api_key.trim(),
        is_active: data.is_active !== false,
      };
    }
  } catch (err) {
    console.warn("[iptv-server] iptv_server_integrations lookup fallback:", err);
  }

  // 2. Fallback: tenta buscar na tabela settings se colunas foram adicionadas
  try {
    let sQuery = (supabaseAdmin as SupabaseClient)
      .from("settings")
      .select("iptv_server_name,iptv_api_url,iptv_api_key");
    if (userId) sQuery = sQuery.eq("user_id", userId);
    const { data: sData, error: sErr } = await sQuery.limit(1).maybeSingle();
    if (!sErr && sData && (sData as any).iptv_api_url && (sData as any).iptv_api_key) {
      return {
        server_name: (sData as any).iptv_server_name || "RBOYS",
        base_url: normalizeIptvBaseUrl((sData as any).iptv_api_url),
        api_key: (sData as any).iptv_api_key.trim(),
      };
    }
  } catch {
    // Colunas de fallback podem não existir no schema
  }

  // 3. Fallback: variáveis de ambiente (se configuradas)
  const envUrl = process.env.IPTV_API_URL || process.env.IPTV_BASE_URL;
  const envKey = process.env.IPTV_API_KEY;
  if (envUrl && envKey) {
    return {
      server_name: process.env.IPTV_SERVER_NAME || "RBOYS",
      base_url: normalizeIptvBaseUrl(envUrl),
      api_key: envKey.trim(),
    };
  }

  return null;
}

export async function saveIptvServerConfig(
  userId: string,
  input: { server_name?: string; base_url: string; api_key?: string }
): Promise<{ ok: boolean }> {
  if (!userId) throw new Error("Conta de administrador não identificada.");
  const base_url = normalizeIptvBaseUrl(input.base_url);
  if (!base_url) throw new Error("URL Base da API do servidor obrigatória.");

  const old = await getIptvServerConfig(userId);
  const api_key = input.api_key?.trim() || old?.api_key;
  if (!api_key) throw new Error("Chave API (X-API-Key) obrigatória.");
  const server_name = (input.server_name || old?.server_name || "RBOYS").trim();

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Upsert na tabela iptv_server_integrations
  let { error } = await (supabaseAdmin as SupabaseClient).from("iptv_server_integrations").upsert({
    user_id: userId,
    server_name,
    base_url,
    api_key,
    is_active: true,
    updated_at: new Date().toISOString(),
  });

  // Se o erro for de coluna 'is_active' ausente em caso de tabela preexistente sem a coluna
  if (error && error.message?.includes("is_active")) {
    const retry = await (supabaseAdmin as SupabaseClient).from("iptv_server_integrations").upsert({
      user_id: userId,
      server_name,
      base_url,
      api_key,
      updated_at: new Date().toISOString(),
    });
    error = retry.error;
  }

  if (error) {
    // Tenta fallback em settings se colunas foram adicionadas
    const settingsFallback = await (supabaseAdmin as SupabaseClient)
      .from("settings")
      .update({
        iptv_server_name: server_name,
        iptv_api_url: base_url,
        iptv_api_key: api_key,
      } as any)
      .eq("user_id", userId);

    if (settingsFallback.error) {
      console.error("[saveIptvServerConfig error]", error);
      if (
        error.message?.includes("schema cache") ||
        error.message?.includes("does not exist") ||
        error.code === "PGRST204" ||
        error.code === "42P01"
      ) {
        throw new Error(
          "A tabela 'public.iptv_server_integrations' ainda não foi criada no Supabase. Execute a migration SQL no SQL Editor do painel do Supabase."
        );
      }
      throw new Error(`Falha ao salvar servidor no banco de dados (${error.message}).`);
    }
  }

  return { ok: true };
}

export async function testIptvServerConnection(config: {
  base_url: string;
  api_key: string;
}): Promise<ServerTestResult> {
  const base_url = normalizeIptvBaseUrl(config.base_url);
  if (!base_url) throw new Error("URL Base da API do servidor obrigatória.");
  if (!config.api_key?.trim()) throw new Error("Chave API (X-API-Key) obrigatória para o teste.");

  const headers = buildIptvHeaders(config.api_key);
  const startTime = Date.now();

  // Candidatos de URL para o endpoint oficial /me
  // 1. https://cms.rboys02.click/api/v1/me (ou {base_url}/me se base_url já contiver /v1)
  // 2. {base_url}/me (fallback direto)
  const cleanBase = base_url.replace(/\/+$/, "");
  const candidates: string[] = [];

  if (cleanBase.endsWith("/v1")) {
    candidates.push(`${cleanBase}/me`);
    candidates.push(`${cleanBase.replace(/\/v1$/, "")}/me`);
  } else {
    // Endpoint oficial da documentação RBOYS: https://cms.rboys02.click/api/v1/me
    candidates.push(`${cleanBase}/v1/me`);
    candidates.push(`${cleanBase}/me`);
  }

  let usedUrl = candidates[0];
  let lastError: any = null;

  for (const targetUrl of candidates) {
    try {
      usedUrl = targetUrl;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(targetUrl, {
        method: "GET",
        headers,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Chave API (X-API-Key) não autorizada pelo servidor (HTTP ${res.status}). Verifique se a chave informada está correta e ativa no painel RBOYS.`
        );
      }

      // Se for 404 e tivermos outro candidato, tenta o próximo
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

        const balance = accountObj.balance !== undefined && accountObj.balance !== null ? accountObj.balance : null;
        const name = String(accountObj.name || accountObj.nome || "").trim();
        const username = String(accountObj.username || accountObj.usuario || accountObj.login || accountObj.user || "").trim();
        const email = String(accountObj.email || "").trim();
        const role = String(accountObj.role || accountObj.profile || accountObj.tipo || "").trim();
        const activeClients = accountObj.active_clients ?? accountObj.clients_count ?? accountObj.total_clients ?? accountObj.active_connections ?? null;

        let message = `Conexão estabelecida com sucesso (HTTP ${res.status} em ${latencyMs}ms)!`;
        const parts: string[] = [];
        if (credits !== null) parts.push(`Saldo: ${credits} crédito(s)`);
        if (name || username) parts.push(`Conta: ${name || username}`);
        if (parts.length > 0) {
          message = `Conexão bem-sucedida! ${parts.join(" • ")} (${latencyMs}ms)`;
        }

        return {
          ok: true,
          status: res.status,
          latencyMs,
          url: targetUrl,
          message,
          account: {
            name: name || null,
            username: username || null,
            credits: credits !== null ? credits : null,
            balance: balance !== null ? balance : null,
            email: email || null,
            role: role || null,
            active_clients: activeClients,
            raw: data,
          },
        };
      }

      // Se respondeu status HTTP de erro (não 404 recuperável)
      const errBody = await res.json().catch(() => ({}));
      const serverErrMsg = (errBody && (errBody.message || errBody.error)) || `HTTP ${res.status}`;
      throw new Error(`Servidor respondeu ${serverErrMsg} ao consultar ${targetUrl}`);
    } catch (err: any) {
      lastError = err;
      if (err.name === "AbortError") {
        throw new Error(`Tempo limite de conexão excedido (10s) ao consultar ${targetUrl}. Verifique se o servidor está acessível na internet.`);
      }
      if (err.message?.includes("X-API-Key") || err.message?.includes("HTTP 401") || err.message?.includes("HTTP 403")) {
        throw err;
      }
      if (targetUrl !== candidates[candidates.length - 1]) {
        continue;
      }
      throw err;
    }
  }

  if (lastError) throw lastError;
  throw new Error(`Falha ao conectar no endpoint /me do servidor (${usedUrl}).`);
}

/**
 * Consulta em tempo real o saldo de créditos da conta no servidor (RBOYS)
 * Lê dinamicamente as credenciais da tabela iptv_server_integrations
 */
export async function fetchServerCredits(userId?: string): Promise<ServerCreditsSummary> {
  const config = await getIptvServerConfig(userId);
  if (!config) {
    return {
      ok: false,
      configured: false,
      server_name: "RBOYS",
      credits: null,
      formatted_credits: "0.00",
      is_low_balance: false,
      error: "Servidor IPTV / P2P não configurado.",
    };
  }

  try {
    const testRes = await testIptvServerConnection({
      base_url: config.base_url,
      api_key: config.api_key,
    });

    const creditsRaw = testRes.account?.credits;
    let creditsNum: number | null = null;
    if (creditsRaw !== null && creditsRaw !== undefined) {
      const parsed = typeof creditsRaw === "number" ? creditsRaw : parseFloat(String(creditsRaw).replace(",", "."));
      if (!isNaN(parsed)) creditsNum = parsed;
    }

    const formatted = creditsNum != null ? creditsNum.toFixed(2) : "0.00";
    const isLow = creditsNum != null && creditsNum < 5;

    return {
      ok: true,
      configured: true,
      server_name: config.server_name || "RBOYS",
      base_url: config.base_url,
      credits: creditsNum,
      formatted_credits: formatted,
      is_low_balance: isLow,
      balance: testRes.account?.balance ?? null,
      name: testRes.account?.name ?? null,
      username: testRes.account?.username ?? null,
      email: testRes.account?.email ?? null,
      active_clients: testRes.account?.active_clients != null ? Number(testRes.account.active_clients) : null,
      raw: testRes.account?.raw,
    };
  } catch (err: any) {
    console.warn("[fetchServerCredits error]", err);
    return {
      ok: false,
      configured: true,
      server_name: config.server_name || "RBOYS",
      base_url: config.base_url,
      credits: null,
      formatted_credits: "0.00",
      is_low_balance: false,
      error: err.message || "Falha ao consultar créditos no servidor.",
    };
  }
}

/**
 * SERVIÇO CENTRALIZADO PARA TODAS AS INTEGRAÇÕES:
 * Sempre lê dinamicamente as credenciais cadastradas no banco de dados.
 * Fonte única da verdade para renovações, clientes, sincronização de pacotes, etc.
 */
export async function callIptvServerApi<T = any>(
  endpoint: string,
  options?: {
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    body?: any;
    userId?: string;
    timeoutMs?: number;
  }
): Promise<T> {
  const config = await getIptvServerConfig(options?.userId);
  if (!config) {
    throw new Error(
      "Servidor IPTV / P2P não configurado. Acesse 'Painel ADM → API e Integrações' e configure a URL Base e a X-API-Key."
    );
  }

  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const fullUrl = `${config.base_url}${cleanEndpoint}`;
  const method = options?.method || (options?.body ? "POST" : "GET");
  const headers = buildIptvHeaders(config.api_key);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs || 15000);

  const init: RequestInit = {
    method,
    headers,
    signal: controller.signal,
    redirect: "manual",
  };

  if (options?.body) {
    init.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  try {
    const res = await fetch(fullUrl, init).finally(() => clearTimeout(timeout));
    const data = await res.json().catch(() => ({}));

    if (!res.ok || (data && (data.ok === false || data.success === false))) {
      const errMsg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
      throw new Error(`Erro na API do servidor IPTV (${errMsg})`);
    }

    return data as T;
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`Tempo limite esgotado ao chamar API do servidor IPTV (${fullUrl}).`);
    }
    throw err;
  }
}

function extractClientsArray(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (typeof res === "object") {
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.clients)) return res.clients;
    if (Array.isArray(res.users)) return res.users;
    if (Array.isArray(res.items)) return res.items;
    if (Array.isArray(res.result)) return res.result;
    if (Array.isArray(res.rows)) return res.rows;
  }
  return [];
}

/**
 * Consulta em tempo real todos os clientes do servidor RBOYS (/iptv/clients e /p2p/clients)
 * Normaliza os campos e ordena estritamente por vencimento em ordem crescente.
 */
export async function fetchServerClients(ownerId?: string): Promise<{
  ok: boolean;
  server_name: string;
  base_url: string;
  total: number;
  kpis: {
    total: number;
    ativos: number;
    vencidos: number;
    vencem_hoje: number;
  };
  clients: NormalizedServerClient[];
}> {
  const config = await getIptvServerConfig(ownerId);
  if (!config) {
    throw new Error(
      "Servidor IPTV / P2P não configurado. Acesse 'Painel ADM → API e Integrações' e configure a URL Base e a X-API-Key."
    );
  }

  const rawList: { item: any; type: "IPTV" | "P2P" }[] = [];

  // Consulta rotas de listagem /iptv/clients e /p2p/clients em paralelo
  const [iptvRes, p2pRes] = await Promise.allSettled([
    callIptvServerApi("/iptv/clients", { userId: ownerId }),
    callIptvServerApi("/p2p/clients", { userId: ownerId }),
  ]);

  let anySuccess = false;

  if (iptvRes.status === "fulfilled" && iptvRes.value) {
    const list = extractClientsArray(iptvRes.value);
    for (const item of list) {
      rawList.push({ item, type: "IPTV" });
    }
    anySuccess = true;
  }

  if (p2pRes.status === "fulfilled" && p2pRes.value) {
    const list = extractClientsArray(p2pRes.value);
    for (const item of list) {
      rawList.push({ item, type: "P2P" });
    }
    anySuccess = true;
  }

  // Fallback caso /iptv/clients e /p2p/clients não retornem nada ou não existam
  if (rawList.length === 0) {
    try {
      const fallbackRes = await callIptvServerApi("/clients", { userId: ownerId });
      const list = extractClientsArray(fallbackRes);
      for (const item of list) {
        rawList.push({ item, type: "IPTV" });
      }
      if (list.length > 0) anySuccess = true;
    } catch {
      // Ignora erro do fallback /clients
    }
  }

  if (!anySuccess && rawList.length === 0) {
    const iptvErr = iptvRes.status === "rejected" ? iptvRes.reason?.message : "";
    const p2pErr = p2pRes.status === "rejected" ? p2pRes.reason?.message : "";
    const errMsg = iptvErr || p2pErr || "Nenhum cliente retornado pela API do servidor.";
    throw new Error(`Falha ao consultar clientes do servidor IPTV/P2P: ${errMsg}`);
  }

  // Normalização e desduplicação
  const seenUsernames = new Set<string>();
  const normalizedClients: NormalizedServerClient[] = [];

  for (const entry of rawList) {
    const normalized = normalizeServerClientItem(entry.item, entry.type, config.server_name);
    const key = `${normalized.type}:${normalized.username.toLowerCase()}`;
    if (!seenUsernames.has(key)) {
      seenUsernames.add(key);
      normalizedClients.push(normalized);
    }
  }

  // Ordenação por vencimento em ordem crescente (mais próximos/vencidos primeiro, sem vencimento no final)
  const sorted = sortServerClientsByDue(normalizedClients);

  const kpis = {
    total: sorted.length,
    ativos: sorted.filter((c) => !c.is_disabled && c.status !== "desativado" && (!c.is_expired || c.is_due_today)).length,
    desativados: sorted.filter((c) => c.is_disabled || c.status === "desativado").length,
    vencidos: sorted.filter((c) => !c.is_disabled && c.status !== "desativado" && c.is_expired && !c.is_due_today).length,
    vencem_hoje: sorted.filter((c) => !c.is_disabled && c.status !== "desativado" && (c.is_due_today || c.status === "vencem_hoje")).length,
  };

  return {
    ok: true,
    server_name: config.server_name,
    base_url: config.base_url,
    total: sorted.length,
    kpis,
    clients: sorted,
  };
}

/**
 * Vincula ou importa um cliente do servidor RBOYS para o banco de dados do AJPVIP (Supabase)
 * Mantém a mesma data de vencimento exata do RBOYS sem somar dias nem gerar faturas retroativas.
 */
export async function importServerClient(
  ownerId: string,
  clientData: {
    username: string;
    password?: string;
    name?: string;
    phone?: string;
    due_date?: string | null;
    type?: string;
    server_name?: string;
    price_cents?: number;
    notes?: string;
  }
): Promise<{ ok: boolean; linked: boolean; id: string; name: string }> {
  if (!ownerId) throw new Error("Conta de administrador não identificada.");
  const username = String(clientData.username || "").trim();
  if (!username) throw new Error("Usuário/login do cliente obrigatório.");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Verifica se já existe cliente cadastrado com esse iptv_login
  const { data: existing } = await (supabaseAdmin as SupabaseClient)
    .from("clients")
    .select("id, name, phone, due_date, status")
    .eq("user_id", ownerId)
    .ilike("iptv_login", username)
    .limit(1)
    .maybeSingle();

  const todayBrasilia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const exactDueDate = clientData.due_date || (existing?.due_date ? existing.due_date : todayBrasilia);
  const isExpired = exactDueDate < todayBrasilia;
  const status = isExpired ? "vencido" : "ativo";

  if (existing) {
    // Atualiza o cliente existente mantendo a data exata do RBOYS
    const patch: Record<string, any> = {
      due_date: exactDueDate,
      status,
      updated_at: new Date().toISOString(),
    };
    if (clientData.password) patch.iptv_password = clientData.password.trim();
    if (clientData.name && !existing.name) patch.name = clientData.name.trim();

    const { error: updErr } = await (supabaseAdmin as SupabaseClient)
      .from("clients")
      .update(patch)
      .eq("id", existing.id);

    if (updErr) throw new Error(`Falha ao vincular cliente existente: ${updErr.message}`);

    return {
      ok: true,
      linked: true,
      id: existing.id,
      name: existing.name,
    };
  }

  // Inserção de novo cliente
  const name = String(clientData.name || clientData.username).trim();
  const phone = String(clientData.phone || "").trim() || "(00) 00000-0000";
  const notes = clientData.notes
    ? clientData.notes.trim()
    : `Importado do servidor ${clientData.server_name || "RBOYS"} (${clientData.type || "IPTV"})`;

  const newRecord = {
    user_id: ownerId,
    name,
    phone,
    iptv_login: username,
    iptv_password: clientData.password ? clientData.password.trim() : null,
    due_date: exactDueDate,
    status,
    price_cents: Math.max(0, Number(clientData.price_cents) || 3000),
    auto_charge: true,
    points: 1,
    notes,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: insData, error: insErr } = await (supabaseAdmin as SupabaseClient)
    .from("clients")
    .insert(newRecord)
    .select("id")
    .single();

  if (insErr) throw new Error(`Falha ao importar cliente para o AJPVIP: ${insErr.message}`);

  return {
    ok: true,
    linked: false,
    id: insData?.id,
    name,
  };
}

export async function fetchOnlineConnections(userId?: string): Promise<{
  ok: boolean;
  server_name: string;
  base_url: string;
  total: number;
  connections: NormalizedServerConnection[];
  error?: string;
}> {
  const config = await getIptvServerConfig(userId);
  if (!config) {
    return {
      ok: false,
      server_name: "RBOYS",
      base_url: "",
      total: 0,
      connections: [],
      error: "Servidor IPTV / P2P não configurado.",
    };
  }

  const headers = buildIptvHeaders(config.api_key);
  const connectionsList: NormalizedServerConnection[] = [];
  const seen = new Set<string>();

  const fetchRoute = async (paths: string[], defaultType: "IPTV" | "P2P") => {
    for (const path of paths) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${config.base_url}${path}`, {
          headers,
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        if (!res.ok) {
          if (res.status === 404) continue;
          return;
        }

        const data = await res.json().catch(() => ({}));
        const items = extractClientsArray(data);
        for (const item of items) {
          const conn = normalizeServerConnection(item, defaultType, config.server_name);
          const key = `${conn.type}-${conn.id}-${conn.username}`;
          if (!seen.has(key)) {
            seen.add(key);
            connectionsList.push(conn);
          }
        }
        break;
      } catch (err) {
        console.warn(`[iptv-server] erro ao consultar conexões em ${path}:`, err);
      }
    }
  };

  await Promise.allSettled([
    fetchRoute(["/iptv/connections", "/connections", "/iptv/live-connections", "/live-connections"], "IPTV"),
    fetchRoute(["/p2p/connections", "/p2p/live-connections"], "P2P"),
  ]);

  return {
    ok: true,
    server_name: config.server_name,
    base_url: config.base_url,
    total: connectionsList.length,
    connections: connectionsList,
  };
}

export async function fetchServerPlans(
  userId?: string,
  filterType?: "IPTV" | "P2P" | "ALL"
): Promise<{
  ok: boolean;
  server_name: string;
  plans: NormalizedServerPlan[];
  error?: string;
}> {
  const config = await getIptvServerConfig(userId);
  if (!config) {
    return {
      ok: false,
      server_name: "RBOYS",
      plans: [],
      error: "Servidor IPTV / P2P não configurado.",
    };
  }

  const headers = buildIptvHeaders(config.api_key);
  const plansList: NormalizedServerPlan[] = [];
  const seen = new Set<string>();

  const fetchRoute = async (paths: string[], defaultType: "IPTV" | "P2P") => {
    for (const path of paths) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${config.base_url}${path}`, {
          headers,
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        if (!res.ok) {
          if (res.status === 404) continue;
          return;
        }

        const data = await res.json().catch(() => ({}));
        const items = extractClientsArray(data);
        for (const item of items) {
          const plan = normalizeServerPlan(item, defaultType);
          const key = `${plan.type}-${plan.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            plansList.push(plan);
          }
        }
        break;
      } catch (err) {
        console.warn(`[iptv-server] erro ao consultar planos em ${path}:`, err);
      }
    }
  };

  const tasks: Promise<any>[] = [];
  if (!filterType || filterType === "ALL" || filterType === "IPTV") {
    tasks.push(fetchRoute(["/iptv/plans", "/plans", "/packages"], "IPTV"));
  }
  if (!filterType || filterType === "ALL" || filterType === "P2P") {
    tasks.push(fetchRoute(["/p2p/plans"], "P2P"));
  }

  await Promise.allSettled(tasks);

  plansList.sort((a, b) => {
    if (a.is_trial !== b.is_trial) return a.is_trial ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  return {
    ok: true,
    server_name: config.server_name,
    plans: plansList,
  };
}

export async function createServerClient(
  ownerId: string,
  input: CreateServerClientInput
): Promise<CreatedServerClientResult> {
  if (!ownerId) throw new Error("Conta de administrador não identificada.");
  if (!input.name || input.name.trim().length < 2) {
    throw new Error("Informe o nome do cliente.");
  }
  if (!input.phone || input.phone.trim().length < 8) {
    throw new Error("Informe um número de WhatsApp válido.");
  }

  const config = await getIptvServerConfig(ownerId);
  if (!config) {
    throw new Error(
      "Servidor IPTV / P2P não configurado. Salve as credenciais em 'API e Integrações' antes de gerar acessos."
    );
  }

  const endpoint = input.type === "P2P" ? "/p2p/clients" : "/iptv/clients";
  const url = `${config.base_url}${endpoint}`;
  const headers = buildIptvHeaders(config.api_key);

  const payload: Record<string, any> = {
    name: input.name.trim(),
    notes: input.notes?.trim() || undefined,
  };

  if (input.plan_id) {
    payload.plan_id = input.plan_id;
    payload.package_id = input.plan_id;
  }
  if (input.username?.trim()) payload.username = input.username.trim();
  if (input.password?.trim()) payload.password = input.password.trim();
  if (input.is_trial) {
    payload.is_trial = true;
    payload.trial = true;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let resData: any = null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    resData = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg =
        resData?.message ||
        resData?.error ||
        `Erro do servidor HTTP ${res.status}`;
      throw new Error(`Falha ao criar cliente no servidor ${config.server_name}: ${errMsg}`);
    }
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error("Tempo limite excedido ao comunicar com o servidor IPTV (15s).");
    }
    throw err;
  }

  const clientObj = resData?.data || resData?.client || resData;
  const serverClientId =
    clientObj.id ?? clientObj.client_id ?? clientObj.user_id ?? Math.random().toString(36).substring(7);

  const username = String(
    clientObj.username ?? clientObj.login ?? clientObj.user ?? input.username ?? `user_${serverClientId}`
  ).trim();

  const password = String(
    clientObj.password ?? clientObj.senha ?? input.password ?? Math.random().toString(36).substring(7)
  ).trim();

  const rawExpiry =
    clientObj.expires_at ??
    clientObj.exp_date ??
    clientObj.expiration ??
    clientObj.due_date ??
    clientObj.vencimento;

  const parsed = parseRboysDate(rawExpiry);
  const dns = clientObj.dns || clientObj.server_url || clientObj.host || undefined;

  let message = clientObj.message || clientObj.text || clientObj.whatsapp_message;
  if (!message || typeof message !== "string" || !message.trim()) {
    message = buildFallbackClientAccessMessage({
      name: input.name.trim(),
      username,
      password,
      type: input.type,
      is_trial: input.is_trial,
      display_due: parsed.displayDue,
      dns,
      server_name: config.server_name,
    });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const notesText = input.notes?.trim()
    ? `${input.notes.trim()} | [${config.server_name} ${input.type}] ID: ${serverClientId}`
    : `Criado no servidor ${config.server_name} (${input.type}) | ID: ${serverClientId}`;

  const baseLocalRecord: Record<string, any> = {
    user_id: ownerId,
    name: input.name.trim(),
    phone: input.phone.trim(),
    iptv_login: username,
    iptv_password: password,
    due_date: parsed.dueDateStr,
    status: parsed.isExpired ? "vencido" : "ativo",
    price_cents: input.price_cents !== undefined ? Number(input.price_cents) : (input.is_trial ? 0 : 3000),
    auto_charge: !input.is_trial,
    points: 1,
    notes: notesText,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let localClientId: string | undefined = undefined;
  try {
    const fullRecord = {
      ...baseLocalRecord,
      server_client_id: String(serverClientId),
      server_plan_id: input.plan_id ? String(input.plan_id) : null,
      service_type: input.type.toLowerCase(),
    };
    const { data: insData, error: insErr } = await (supabaseAdmin as SupabaseClient)
      .from("clients")
      .insert(fullRecord)
      .select("id")
      .single();

    if (insErr) {
      if (insErr.message?.includes("column") || insErr.code === "42703") {
        const { data: retryData, error: retryErr } = await (supabaseAdmin as SupabaseClient)
          .from("clients")
          .insert(baseLocalRecord)
          .select("id")
          .single();
        if (retryErr) throw retryErr;
        localClientId = retryData?.id;
      } else {
        throw insErr;
      }
    } else {
      localClientId = insData?.id;
    }
  } catch (dbErr: any) {
    console.error("[iptv-server] erro ao salvar cliente localmente:", dbErr);
  }

  return {
    ok: true,
    server_client_id: serverClientId,
    local_client_id: localClientId,
    username,
    password,
    type: input.type,
    is_trial: input.is_trial,
    expires_at: parsed.iso,
    formatted_due: parsed.formattedDate,
    display_due: parsed.displayDue,
    due_date_str: parsed.dueDateStr,
    message: message.trim(),
    dns,
    server_name: config.server_name,
    raw: clientObj,
  };
}
