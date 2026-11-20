import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeIptvBaseUrl,
  buildIptvHeaders,
  normalizeServerClientItem,
  sortServerClientsByDue,
  type IptvServerConfig,
  type NormalizedServerClient,
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
}): Promise<{ ok: boolean; message: string; status: number; latencyMs: number }> {
  const base_url = normalizeIptvBaseUrl(config.base_url);
  if (!base_url) throw new Error("URL Base da API do servidor obrigatória.");
  if (!config.api_key?.trim()) throw new Error("Chave API (X-API-Key) obrigatória para o teste.");

  const headers = buildIptvHeaders(config.api_key);
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(base_url, {
      method: "GET",
      headers,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const latencyMs = Date.now() - startTime;

    if (res.status === 401 || res.status === 403) {
      throw new Error(`Chave API (X-API-Key) não autorizada pelo servidor (HTTP ${res.status}). Verifique a chave informada.`);
    }

    if (res.ok) {
      return {
        ok: true,
        status: res.status,
        latencyMs,
        message: `Conexão estabelecida com sucesso! Servidor respondeu HTTP ${res.status} em ${latencyMs}ms.`,
      };
    }

    return {
      ok: true,
      status: res.status,
      latencyMs,
      message: `Servidor acessível (HTTP ${res.status} em ${latencyMs}ms). Conexão de rede validada.`,
    };
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error("Tempo limite de conexão excedido (10s). Verifique se a URL Base está acessível na internet.");
    }
    if (err.message?.includes("X-API-Key") || err.message?.includes("HTTP 401") || err.message?.includes("HTTP 403")) {
      throw err;
    }
    throw new Error(`Falha ao conectar na URL Base (${err.message || "Erro de rede"}). Verifique se o endereço é válido e está online.`);
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
  };

  if (options?.body) {
    init.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  try {
    const res = await fetch(fullUrl, init).finally(() => clearTimeout(timeout));
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
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
    ativos: sorted.filter((c) => !c.is_expired && c.status !== "expired").length,
    vencidos: sorted.filter((c) => c.is_expired || c.status === "expired").length,
    vencem_hoje: sorted.filter((c) => c.is_due_today).length,
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
