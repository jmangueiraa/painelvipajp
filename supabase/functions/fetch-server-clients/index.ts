// Supabase Edge Function: fetch-server-clients
// Consulta em tempo real todos os clientes do servidor RBOYS (/iptv/clients e /p2p/clients)
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

function parseRboysDate(raw: any) {
  if (!raw || raw === "0" || raw === "0000-00-00" || raw === "null") {
    return {
      iso: null,
      dueDateStr: null,
      formattedDate: "Sem vencimento",
      formattedTime: "",
      displayDue: "Sem vencimento",
      isExpired: false,
      isDueToday: false,
      timestamp: null,
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

    const isDueToday = dueDateStr === todayBrasilia;
    const isExpired = dueDateStr < todayBrasilia;

    const tsTime = hour && minute ? `${hour}:${minute}:00` : "23:59:59";
    const ts = new Date(`${dueDateStr}T${tsTime}-03:00`).getTime();

    return {
      iso: str,
      dueDateStr,
      formattedDate,
      formattedTime,
      displayDue,
      isExpired,
      isDueToday,
      timestamp: isNaN(ts) ? 0 : ts,
    };
  }

  return {
    iso: str,
    dueDateStr: null,
    formattedDate: str,
    formattedTime: "",
    displayDue: str,
    isExpired: false,
    isDueToday: false,
    timestamp: null,
  };
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
    // Fallback settings
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
        error: "Servidor IPTV / P2P não configurado no painel administrativo.",
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

  const clients: any[] = [];

  const fetchRoute = async (endpoint: string, type: "IPTV" | "P2P") => {
    try {
      const res = await fetch(`${baseUrl}${endpoint}`, { headers });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.clients)
        ? data.clients
        : [];

      for (const item of list) {
        const username = String(item.username ?? item.login ?? item.user ?? "").trim();
        const rawExpiry = item.expires_at ?? item.exp_date ?? item.expiration ?? item.due_date ?? null;
        const parsed = parseRboysDate(rawExpiry);

        clients.push({
          id: item.id ?? item._id ?? username,
          username,
          password: item.password ?? item.pass ?? null,
          name: item.name ?? item.nome ?? null,
          type,
          status: parsed.dueDateStr && parsed.isExpired ? "expired" : "active",
          expires_at: parsed.iso,
          formatted_due: parsed.formattedDate,
          formatted_due_time: parsed.formattedTime,
          due_date_str: parsed.dueDateStr,
          display_due: parsed.displayDue,
          is_expired: parsed.isExpired,
          is_due_today: parsed.isDueToday,
          connections: Number(item.max_connections ?? item.connections ?? 1) || 1,
          server_name: serverName,
          parsedTs: parsed.timestamp,
        });
      }
    } catch {
      // Ignora erro de rota individual
    }
  };

  await Promise.allSettled([
    fetchRoute("/iptv/clients", "IPTV"),
    fetchRoute("/p2p/clients", "P2P"),
  ]);

  // Ordenação crescente por vencimento (mais próximos e vencidos primeiro, sem data no final)
  clients.sort((a, b) => {
    if (a.due_date_str === null && b.due_date_str === null) return a.username.localeCompare(b.username);
    if (a.due_date_str === null) return 1;
    if (b.due_date_str === null) return -1;
    const diff = (a.parsedTs ?? 0) - (b.parsedTs ?? 0);
    if (diff !== 0) return diff;
    return a.username.localeCompare(b.username);
  });

  const kpis = {
    total: clients.length,
    ativos: clients.filter((c) => !c.is_expired && c.status !== "expired").length,
    vencidos: clients.filter((c) => c.is_expired || c.status === "expired").length,
    vencem_hoje: clients.filter((c) => c.is_due_today).length,
  };

  return json({
    ok: true,
    server_name: serverName,
    base_url: baseUrl,
    total: clients.length,
    kpis,
    clients,
  });
});
