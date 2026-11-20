// Supabase Edge Function: fetch-online-connections
// Consulta em tempo real conexões online (/iptv/connections e /p2p/connections)
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

function formatDurationSeconds(sec: number): string {
  if (sec < 0) sec = 0;
  if (sec < 60) return `${sec}s`;
  const minutes = Math.floor(sec / 60);
  if (minutes < 60) {
    const s = sec % 60;
    return s > 0 ? `${minutes}m ${s}s` : `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
}

function normalizeConnection(item: any, defaultType: "IPTV" | "P2P" = "IPTV", serverName = "RBOYS") {
  const id = item.id ?? item.user_id ?? item.sub_id ?? item.client_id ?? Math.random().toString(36).substring(7);
  const username = String(
    item.username ?? item.login ?? item.user ?? item.client_username ?? item.name ?? `user_${id}`
  ).trim();

  const channel = String(
    item.stream_name ??
    item.channel_name ??
    item.channel ??
    item.stream_display_name ??
    item.now_playing ??
    item.content_title ??
    item.content ??
    item.title ??
    item.stream ??
    "Canal ao vivo"
  ).trim();

  let type: "IPTV" | "P2P" = defaultType;
  if (item.type) {
    const t = String(item.type).toUpperCase();
    if (t.includes("P2P")) type = "P2P";
    else if (t.includes("IPTV")) type = "IPTV";
  }

  const ip = item.ip ?? item.user_ip ?? item.client_ip ?? item.ip_address ?? undefined;
  const device = item.user_agent ?? item.device ?? item.player ?? item.app_name ?? item.client ?? undefined;

  let durationStr: string | undefined = undefined;
  let durationSec: number | undefined = undefined;
  let connectedAtStr: string | undefined = undefined;

  const rawStart = item.connected_at ?? item.start_time ?? item.started_at ?? item.date_start ?? item.online_since ?? item.login_time;
  if (rawStart) {
    const startMs = typeof rawStart === "number"
      ? (rawStart > 1e11 ? rawStart : rawStart * 1000)
      : new Date(String(rawStart)).getTime();
    if (!isNaN(startMs) && startMs > 0) {
      durationSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      durationStr = formatDurationSeconds(durationSec);
      connectedAtStr = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(startMs));
    }
  }

  if (!durationStr) {
    const rawUptime = item.duration ?? item.uptime ?? item.online_time ?? item.time;
    if (typeof rawUptime === "number") {
      durationSec = rawUptime;
      durationStr = formatDurationSeconds(rawUptime);
    } else if (typeof rawUptime === "string" && rawUptime.trim()) {
      durationStr = rawUptime.trim();
    }
  }

  return {
    id,
    username,
    name: item.name && item.name !== username ? item.name : undefined,
    channel,
    type,
    ip: ip ? String(ip).trim() : undefined,
    device: device ? String(device).trim() : undefined,
    connected_at: connectedAtStr,
    duration: durationStr || "Recente",
    duration_seconds: durationSec,
    server_name: serverName,
    raw: item,
  };
}

function extractArray(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === "object") {
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.connections)) return data.connections;
    if (Array.isArray(data.clients)) return data.clients;
    if (Array.isArray(data.rows)) return data.rows;
    if (Array.isArray(data.results)) return data.results;
    if (Array.isArray(data.items)) return data.items;
  }
  return [];
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

  // Lê credenciais dinamicamente do banco de dados
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
    return json(
      {
        ok: false,
        error: "Servidor IPTV / P2P não configurado no painel administrativo.",
        server_name: "RBOYS",
        total: 0,
        connections: [],
      },
      400
    );
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
    Authorization: `Bearer ${apiKey}`,
  };

  const connections: any[] = [];
  const seen = new Set<string>();

  const fetchRoute = async (paths: string[], defaultType: "IPTV" | "P2P") => {
    for (const path of paths) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${baseUrl}${path}`, {
          headers,
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        if (!res.ok) {
          if (res.status === 404) continue;
          return;
        }

        const data = await res.json().catch(() => ({}));
        const items = extractArray(data);
        for (const item of items) {
          const conn = normalizeConnection(item, defaultType, serverName);
          const key = `${conn.type}-${conn.id}-${conn.username}`;
          if (!seen.has(key)) {
            seen.add(key);
            connections.push(conn);
          }
        }
        break;
      } catch (err) {
        console.warn(`[edge-function] erro ao consultar conexões em ${path}:`, err);
      }
    }
  };

  await Promise.allSettled([
    fetchRoute(["/iptv/connections", "/connections", "/iptv/live-connections", "/live-connections"], "IPTV"),
    fetchRoute(["/p2p/connections", "/p2p/live-connections"], "P2P"),
  ]);

  return json({
    ok: true,
    server_name: serverName,
    base_url: baseUrl,
    total: connections.length,
    connections,
  });
});
