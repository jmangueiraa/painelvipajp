/**
 * Supabase Edge Function Reference / Helper: Centralized IPTV Server API
 *
 * Utilização centralizada: NUNCA deixa URL ou X-API-Key fixas no código.
 * Sempre consulta dinamicamente a tabela `iptv_server_integrations` ou `settings`.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface IptvServerConfig {
  server_name: string;
  base_url: string;
  api_key: string;
}

export function normalizeIptvBaseUrl(raw: string): string {
  let url = (raw || "").trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
}

/**
 * Obtém dinamicamente as credenciais cadastradas no banco de dados.
 */
export async function getIptvServerConfig(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId?: string
): Promise<IptvServerConfig | null> {
  try {
    let query = supabaseAdmin
      .from("iptv_server_integrations")
      .select("server_name, base_url, api_key");

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data?.base_url && data?.api_key) {
      return {
        server_name: data.server_name || "RBOYS",
        base_url: normalizeIptvBaseUrl(data.base_url),
        api_key: data.api_key.trim(),
      };
    }
  } catch (err) {
    console.warn("[iptv] lookup table warning:", err);
  }

  // Fallback para a tabela settings
  try {
    let sQuery = supabaseAdmin
      .from("settings")
      .select("iptv_server_name, iptv_api_url, iptv_api_key");
    if (userId) sQuery = sQuery.eq("user_id", userId);
    const { data: sData } = await sQuery.limit(1).maybeSingle();
    if (sData?.iptv_api_url && sData?.iptv_api_key) {
      return {
        server_name: sData.iptv_server_name || "RBOYS",
        base_url: normalizeIptvBaseUrl(sData.iptv_api_url),
        api_key: sData.iptv_api_key.trim(),
      };
    }
  } catch {
    // ignore
  }

  // Fallback para variáveis de ambiente da Edge Function
  const envUrl = Deno.env.get("IPTV_BASE_URL") || Deno.env.get("IPTV_API_URL");
  const envKey = Deno.env.get("IPTV_API_KEY");
  if (envUrl && envKey) {
    return {
      server_name: Deno.env.get("IPTV_SERVER_NAME") || "RBOYS",
      base_url: normalizeIptvBaseUrl(envUrl),
      api_key: envKey.trim(),
    };
  }

  return null;
}

/**
 * Chamada centralizada para a API do Servidor IPTV
 */
export async function callIptvApi<T = any>(
  supabaseAdmin: ReturnType<typeof createClient>,
  endpoint: string,
  options?: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: any;
    userId?: string;
  }
): Promise<T> {
  const config = await getIptvServerConfig(supabaseAdmin, options?.userId);
  if (!config) {
    throw new Error("Servidor IPTV / P2P não configurado no painel administrativo.");
  }

  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const fullUrl = `${config.base_url}${cleanEndpoint}`;
  const method = options?.method || (options?.body ? "POST" : "GET");

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-API-Key": config.api_key,
    Authorization: `Bearer ${config.api_key}`,
  };

  const response = await fetch(fullUrl, {
    method,
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `Erro na API do Servidor IPTV (${data?.message || data?.error || `HTTP ${response.status}`})`
    );
  }

  return data as T;
}
