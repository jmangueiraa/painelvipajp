export type IptvServerConfig = {
  server_name: string;
  base_url: string;
  api_key: string;
  is_active?: boolean;
};

export type NormalizedServerClient = {
  id: string | number;
  username: string;
  password?: string;
  name?: string;
  phone?: string;
  notes?: string;
  type: "IPTV" | "P2P";
  status: "active" | "expired" | "no_expiration";
  expires_at: string | null;      // String ISO ou original vinda da API
  formatted_due: string;         // "DD/MM/AAAA" ou "Sem vencimento"
  formatted_due_time: string;    // "HH:mm" ou ""
  due_date_str: string | null;   // "YYYY-MM-DD" para gravação direta no banco local
  display_due: string;           // "DD/MM/AAAA HH:mm" ou "Sem vencimento"
  is_expired: boolean;
  is_due_today: boolean;
  connections: number;
  server_name: string;
  raw?: any;
};

export type ServerAccountDetails = {
  name: string | null;
  username: string | null;
  credits: number | string | null;
  balance: number | string | null;
  email: string | null;
  role?: string | null;
  active_clients?: number | string | null;
  raw?: any;
};

export type ServerTestResult = {
  ok: boolean;
  status: number;
  latencyMs: number;
  url: string;
  message: string;
  account?: ServerAccountDetails;
};

export function normalizeIptvBaseUrl(raw: string): string {
  let url = (raw || "").trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, "");
}

export function buildIptvHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (apiKey) {
    const key = apiKey.trim();
    headers["X-API-Key"] = key;
    headers["Authorization"] = `Bearer ${key}`;
  }
  return headers;
}

/**
 * Extrai e preserva com fidelidade absoluta a data e horário no fuso horário de Brasília (-03:00)
 * sem conversão UTC que possa deslocar dias para frente ou para trás.
 */
export function parseRboysDate(raw: any): {
  iso: string | null;
  dueDateStr: string | null; // "YYYY-MM-DD"
  formattedDate: string;     // "DD/MM/AAAA"
  formattedTime: string;     // "HH:mm"
  displayDue: string;        // "DD/MM/AAAA HH:mm" ou "Sem vencimento"
  isExpired: boolean;
  isDueToday: boolean;
  timestamp: number | null;
} {
  if (
    raw === null ||
    raw === undefined ||
    raw === "" ||
    raw === "0" ||
    raw === 0 ||
    raw === "0000-00-00" ||
    raw === "null" ||
    raw === "never"
  ) {
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

  // Data atual no fuso de Brasília (America/Sao_Paulo)
  const todayBrasilia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()); // Ex: "2026-11-20"

  // Se for timestamp epoch Unix numérico
  if (typeof raw === "number" || (/^\d+$/.test(String(raw).trim()) && !String(raw).includes("-"))) {
    const num = Number(raw);
    const ms = num > 1e11 ? num : num * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      const parts = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(d);

      const p: Record<string, string> = {};
      for (const part of parts) p[part.type] = part.value;

      const dueDateStr = `${p.year}-${p.month}-${p.day}`;
      const formattedDate = `${p.day}/${p.month}/${p.year}`;
      const formattedTime = `${p.hour || "00"}:${p.minute || "00"}`;
      const isDueToday = dueDateStr === todayBrasilia;
      const isExpired = dueDateStr < todayBrasilia;

      return {
        iso: `${dueDateStr}T${formattedTime}:00-03:00`,
        dueDateStr,
        formattedDate,
        formattedTime,
        displayDue: `${formattedDate} ${formattedTime}`,
        isExpired,
        isDueToday,
        timestamp: ms,
      };
    }
  }

  const str = String(raw).trim();

  // Se for string ISO com data no início: YYYY-MM-DD
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

    // Calcular timestamp exato com fuso -03:00 para ordenação cronológica fiel
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

  // Fallback caso formato não reconhecido
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

/**
 * Normaliza um item bruto de cliente retornado pela API do servidor RBOYS
 */
export function normalizeServerClientItem(
  item: any,
  defaultType: "IPTV" | "P2P" = "IPTV",
  serverName = "RBOYS"
): NormalizedServerClient {
  const id = item.id ?? item._id ?? item.client_id ?? item.username ?? String(Math.random());
  const username = String(item.username ?? item.login ?? item.user ?? item.login_name ?? "").trim();
  const password = item.password ?? item.pass ?? item.senha ? String(item.password ?? item.pass ?? item.senha).trim() : undefined;
  const name = item.name ?? item.nome ?? item.full_name ?? item.client_name ? String(item.name ?? item.nome ?? item.full_name ?? item.client_name).trim() : undefined;
  const phone = item.phone ?? item.whatsapp ?? item.celular ? String(item.phone ?? item.whatsapp ?? item.celular).trim() : undefined;
  const notes = item.notes ?? item.comment ?? item.obs ?? item.reseller_notes ? String(item.notes ?? item.comment ?? item.obs ?? item.reseller_notes).trim() : undefined;

  const rawType = String(item.type ?? item.service ?? defaultType).toUpperCase();
  const type: "IPTV" | "P2P" = rawType.includes("P2P") ? "P2P" : "IPTV";

  const rawExpiry =
    item.expires_at ??
    item.exp_date ??
    item.expiration ??
    item.due_date ??
    item.vencimento ??
    item.expire_date ??
    item.expiry_date ??
    null;

  const parsed = parseRboysDate(rawExpiry);

  let status: "active" | "expired" | "no_expiration" = "active";
  if (!parsed.dueDateStr) {
    status = "no_expiration";
  } else if (parsed.isExpired) {
    status = "expired";
  }

  if (
    item.status === "expired" ||
    item.status === "vencido" ||
    item.is_active === false ||
    item.active === false ||
    item.enabled === false
  ) {
    if (parsed.dueDateStr) status = "expired";
  }

  const connections = Number(item.max_connections ?? item.connections ?? item.screens ?? item.telas ?? 1) || 1;

  return {
    id,
    username: username || `user_${id}`,
    password,
    name,
    phone,
    notes,
    type,
    status,
    expires_at: parsed.iso,
    formatted_due: parsed.formattedDate,
    formatted_due_time: parsed.formattedTime,
    due_date_str: parsed.dueDateStr,
    display_due: parsed.displayDue,
    is_expired: parsed.isExpired,
    is_due_today: parsed.isDueToday,
    connections,
    server_name: serverName,
    raw: {
      ...item,
      parsedTs: parsed.timestamp,
    },
  };
}

/**
 * Ordenação obrigatória:
 * Vencimento em ordem crescente (mais próximos/vencidos primeiro, datas mais distantes depois).
 * Clientes sem vencimento (null) vão no final da lista.
 */
export function sortServerClientsByDue(clients: NormalizedServerClient[]): NormalizedServerClient[] {
  return [...clients].sort((a, b) => {
    // Datas nulas vão para o final
    const aHasDate = a.due_date_str !== null && a.raw?.parsedTs !== null;
    const bHasDate = b.due_date_str !== null && b.raw?.parsedTs !== null;

    if (!aHasDate && !bHasDate) {
      return a.username.localeCompare(b.username);
    }
    if (!aHasDate) return 1;
    if (!bHasDate) return -1;

    const tsA = Number(a.raw?.parsedTs ?? 0);
    const tsB = Number(b.raw?.parsedTs ?? 0);

    if (tsA !== tsB) {
      return tsA - tsB; // Ordem crescente (mais antigo/mais próximo primeiro)
    }

    return a.username.localeCompare(b.username);
  });
}

export type NormalizedServerConnection = {
  id: string | number;
  username: string;
  name?: string;
  channel: string;               // Canal / Conteúdo assistido
  type: "IPTV" | "P2P";
  ip?: string;
  device?: string;               // Dispositivo / Player / User Agent
  connected_at?: string;         // Horário de início formatado
  duration?: string;             // Tempo online (ex: "45 min", "1h 12m", "30s")
  duration_seconds?: number;
  server_name: string;
  raw?: any;
};

export function formatDurationSeconds(sec: number): string {
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

export function normalizeServerConnection(
  item: any,
  defaultType: "IPTV" | "P2P" = "IPTV",
  serverName: string = "RBOYS"
): NormalizedServerConnection {
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

export type NormalizedServerPlan = {
  id: string | number;
  name: string;
  type: "IPTV" | "P2P";
  is_trial: boolean;
  duration_days?: number;
  duration_hours?: number;
  price_cents?: number;
  screens?: number;
  raw?: any;
};

export function normalizeServerPlan(item: any, defaultType: "IPTV" | "P2P" = "IPTV"): NormalizedServerPlan {
  const id = item.id ?? item.plan_id ?? item.package_id;
  const name = String(item.name ?? item.title ?? item.plan_name ?? `Plano #${id}`).trim();

  let type: "IPTV" | "P2P" = defaultType;
  if (item.type) {
    const t = String(item.type).toUpperCase();
    if (t.includes("P2P")) type = "P2P";
    else if (t.includes("IPTV")) type = "IPTV";
  }

  const isTrial = Boolean(
    item.is_trial === true ||
    item.trial === true ||
    item.is_test === true ||
    item.test === true ||
    /teste|trial|gratis|grátis/i.test(name)
  );

  let durationDays: number | undefined = undefined;
  let durationHours: number | undefined = undefined;

  if (item.duration_days) durationDays = Number(item.duration_days);
  else if (item.days) durationDays = Number(item.days);
  else if (item.duration && Number(item.duration) >= 1 && !item.hours) durationDays = Number(item.duration);

  if (item.duration_hours) durationHours = Number(item.duration_hours);
  else if (item.hours) durationHours = Number(item.hours);

  let priceCents: number | undefined = undefined;
  if (item.price_cents !== undefined) priceCents = Number(item.price_cents);
  else if (item.price !== undefined) priceCents = Math.round(Number(item.price) * 100);

  const screens = Number(item.screens ?? item.telas ?? item.connections ?? item.max_connections ?? 1) || 1;

  return {
    id,
    name,
    type,
    is_trial: isTrial,
    duration_days: durationDays,
    duration_hours: durationHours,
    price_cents: priceCents,
    screens,
    raw: item,
  };
}

export type CreateServerClientInput = {
  type: "IPTV" | "P2P";
  is_trial: boolean;
  plan_id?: string | number;
  name: string;
  phone: string;
  username?: string;
  password?: string;
  notes?: string;
  price_cents?: number;
};

export type CreatedServerClientResult = {
  ok: boolean;
  server_client_id: string | number;
  local_client_id?: string;
  username: string;
  password: string;
  type: "IPTV" | "P2P";
  is_trial: boolean;
  expires_at: string | null;
  formatted_due: string;
  display_due: string;
  due_date_str: string | null;
  message: string;
  dns?: string;
  server_name: string;
  raw?: any;
};

export function buildFallbackClientAccessMessage(data: {
  name: string;
  username: string;
  password: string;
  type: "IPTV" | "P2P";
  is_trial: boolean;
  display_due: string;
  dns?: string;
  server_name?: string;
}): string {
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
