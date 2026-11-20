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
