import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeIptvBaseUrl, buildIptvHeaders, type IptvServerConfig } from "./iptv-server-api";

export async function getIptvServerConfig(userId?: string): Promise<IptvServerConfig | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1. Tenta carregar da tabela dedicada iptv_server_integrations
  try {
    let query = (supabaseAdmin as SupabaseClient)
      .from("iptv_server_integrations")
      .select("server_name,base_url,api_key");

    if (userId) {
      query = query.eq("user_id", userId);
    }
    const { data, error } = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();

    if (!error && data?.base_url && data?.api_key) {
      return {
        server_name: data.server_name || "RBOYS",
        base_url: normalizeIptvBaseUrl(data.base_url),
        api_key: data.api_key.trim(),
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
  const { error } = await (supabaseAdmin as SupabaseClient).from("iptv_server_integrations").upsert({
    user_id: userId,
    server_name,
    base_url,
    api_key,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    // Tenta fallback em settings se a tabela ainda não tiver sido criada
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
      throw new Error(
        `Falha ao salvar servidor no banco de dados (${error.message}). Execute a migration de banco caso a tabela não exista.`
      );
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
