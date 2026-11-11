import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ClientStatus } from "@/lib/status";

const ADMIN_USERNAME = (process.env.PORTAL_ADMIN_USERNAME || "jmangueira").trim();
// SHA-256 of "ajpvip-portal-adm:30101695" (default fallback when PORTAL_ADMIN_PASSWORD env is unset)
const DEFAULT_ADMIN_PASS_HASH = "77c831de3eeaacea20c05c3e5362893ebabc86f4278cec9206f25a5970a9bcb0";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function timingSafeHexEqual(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "utf8");
  const b = Buffer.from(bHex, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function getSigningSecret(): string {
  if (process.env.PORTAL_ADMIN_SECRET) return process.env.PORTAL_ADMIN_SECRET;
  const seed =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    "zfafucaxbktpifydecng";
  return sha256Hex(`ajpvip-adm-hmac-v1:${seed}`);
}

export function getRpcAdminKey(): string {
  return process.env.PORTAL_ADMIN_RPC_KEY || DEFAULT_ADMIN_PASS_HASH;
}

export function isAdminUsername(username: string): boolean {
  return username.trim().toLowerCase() === ADMIN_USERNAME.toLowerCase();
}

export function verifyAdminCredentials(username: string, password: string): boolean {
  if (!isAdminUsername(username)) return false;
  const expectedHash = process.env.PORTAL_ADMIN_PASSWORD
    ? sha256Hex(`ajpvip-portal-adm:${process.env.PORTAL_ADMIN_PASSWORD.trim()}`)
    : DEFAULT_ADMIN_PASS_HASH;
  const providedHash = sha256Hex(`ajpvip-portal-adm:${password.trim()}`);
  return timingSafeHexEqual(providedHash, expectedHash);
}

export type AdminIdentity = {
  username: string;
  name: string;
};

export function createAdminSession(username: string): { token: string; expires_at: string } {
  const now = Date.now();
  const exp = now + SESSION_TTL_MS;
  const payload = {
    role: "admin",
    sub: username.trim().toLowerCase(),
    iat: now,
    exp,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", getSigningSecret()).update(payloadB64).digest("base64url");
  return {
    token: `adm.${payloadB64}.${sig}`,
    expires_at: new Date(exp).toISOString(),
  };
}

export function verifyAdminToken(token: string | null | undefined): AdminIdentity | null {
  if (!token || !token.startsWith("adm.")) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [, payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  const expectedSig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(payloadB64)
    .digest("base64url");
  if (!timingSafeHexEqual(sigB64, expectedSig)) return null;

  try {
    const raw = Buffer.from(payloadB64, "base64url").toString("utf8");
    const payload = JSON.parse(raw) as { role?: string; sub?: string; exp?: number };
    if (payload.role !== "admin" || !payload.sub || !payload.exp || payload.exp <= Date.now()) {
      return null;
    }
    if (!isAdminUsername(payload.sub)) return null;
    return { username: payload.sub, name: "Administrador" };
  } catch {
    return null;
  }
}

export function extractPortalToken(request: Request): string {
  const custom = request.headers.get("x-portal-token")?.trim();
  if (custom) return custom;
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return "";
}

export function todayIsoSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function computeStatusSP(dueISO: string, current: ClientStatus, today = todayIsoSP()): ClientStatus {
  if (current === "suspenso" || current === "cancelado") return current;
  return dueISO < today ? "vencido" : "ativo";
}

export async function resolveAdminOwnerId(): Promise<string> {
  const { data: settingsRow } = await supabaseAdmin
    .from("settings")
    .select("user_id")
    .limit(1)
    .maybeSingle();
  if (settingsRow?.user_id) return settingsRow.user_id;

  const { data: clientRow } = await supabaseAdmin
    .from("clients")
    .select("user_id")
    .not("user_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (clientRow?.user_id) return clientRow.user_id;

  return process.env.PORTAL_OWNER_USER_ID || "8e28f798-6df6-41f3-abcd-cb99bc164642";
}

export async function getAdminSettingsRow(ownerId?: string) {
  const uid = ownerId || (await resolveAdminOwnerId());
  const { data } = await supabaseAdmin
    .from("settings")
    .select("*")
    .eq("user_id", uid)
    .maybeSingle();
  if (data) return data as Record<string, any>;

  const { data: first } = await supabaseAdmin.from("settings").select("*").limit(1).maybeSingle();
  return (first as Record<string, any> | null) ?? null;
}

export async function getAdminMePayload(admin: AdminIdentity) {
  const ownerId = await resolveAdminOwnerId();
  const [settingsRow, storeProdsRes, plansRes, updatesRes] = await Promise.allSettled([
    getAdminSettingsRow(ownerId),
    supabaseAdmin
      .from("store_products")
      .select("id,key,label,sale_cents,duration_days,emoji,gradient,sort_order,image_url")
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("plans")
      .select("id,name,price_cents,duration_days")
      .eq("user_id", ownerId)
      .eq("active", true)
      .order("duration_days", { ascending: true }),
    supabaseAdmin
      .from("content_updates")
      .select("id,kind,title,description,image_url,created_at")
      .eq("user_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const s = settingsRow.status === "fulfilled" ? settingsRow.value : null;
  const rawProds = storeProdsRes.status === "fulfilled" ? (storeProdsRes.value.data ?? []) : [];
  const plans = plansRes.status === "fulfilled" ? (plansRes.value.data ?? []) : [];
  const updates = updatesRes.status === "fulfilled" ? (updatesRes.value.data ?? []) : [];

  return {
    is_admin: true,
    admin: {
      username: admin.username,
      name: admin.name,
      owner_user_id: ownerId,
    },
    client: null,
    plan: null,
    server: null,
    payments: [],
    referrals: [],
    referrals_paid_ids: [],
    plans,
    updates,
    store_products: rawProds.map((p: any) => ({
      id: p.key || p.id,
      label: p.label,
      price_cents: p.sale_cents,
      emoji: p.emoji ?? "🛒",
      gradient: p.gradient ?? "from-emerald-500 to-teal-600",
      image_url: p.image_url ?? null,
    })),
    settings: {
      referral_reward_days: s?.referral_reward_days ?? 30,
      referral_enabled: s?.referral_enabled ?? true,
      app_android_url: s?.app_android_url ?? null,
      app_ios_url: s?.app_ios_url ?? null,
      whatsapp_instance: s?.whatsapp_instance ?? null,
      updates_movies_text: s?.updates_movies_text ?? null,
      updates_series_text: s?.updates_series_text ?? null,
      updates_movies_updated_at: s?.updates_movies_updated_at ?? null,
      updates_series_updated_at: s?.updates_series_updated_at ?? null,
      updates_games_text: s?.updates_games_text ?? null,
      updates_games_updated_at: s?.updates_games_updated_at ?? null,
    },
  };
}

async function fetchCatalogWithRpcFallback(ownerId: string) {
  const [plansDirect, serversDirect, purchasesDirect] = await Promise.all([
    supabaseAdmin
      .from("plans")
      .select("id,user_id,name,price_cents,duration_days,description,active")
      .eq("user_id", ownerId)
      .order("duration_days", { ascending: true }),
    supabaseAdmin
      .from("servers")
      .select("id,user_id,name,credit_cost_cents")
      .eq("user_id", ownerId)
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("store_purchases")
      .select("id,client_id,product_key,label,sale_cents,cost_cents,purchased_at,buyer_name")
      .eq("user_id", ownerId)
      .order("purchased_at", { ascending: false })
      .limit(200),
  ]);

  let plans = (plansDirect.data ?? []) as any[];
  let servers = (serversDirect.data ?? []) as any[];
  let purchases = (purchasesDirect.data ?? []) as any[];

  if (plans.length === 0 || servers.length === 0 || purchases.length === 0) {
    try {
      const { data: rpcCat, error: rpcErr } = await (supabaseAdmin.rpc as any)(
        "portal_admin_get_catalog",
        { _admin_key: getRpcAdminKey(), _owner_id: ownerId },
      );
      if (!rpcErr && rpcCat && typeof rpcCat === "object") {
        if (plans.length === 0 && Array.isArray(rpcCat.plans)) plans = rpcCat.plans;
        if (servers.length === 0 && Array.isArray(rpcCat.servers)) servers = rpcCat.servers;
        if (purchases.length === 0 && Array.isArray(rpcCat.purchases)) purchases = rpcCat.purchases;
      }
    } catch {
      // RPC opcional caso migration ainda não tenha sido aplicada
    }
  }

  return { plans, servers, purchases };
}

export async function getAdminFullSnapshot() {
  const ownerId = await resolveAdminOwnerId();
  const today = todayIsoSP();
  const monthPrefix = today.slice(0, 7);
  const curYear = Number(today.slice(0, 4));
  const curMonthNum = Number(today.slice(5, 7)) - 1;

  const [clientsRes, paymentsRes, storeProdsRes, settingsRow, catalog] = await Promise.all([
    supabaseAdmin
      .from("clients")
      .select(
        "id,user_id,name,phone,email,iptv_login,iptv_password,plan_id,server_id,price_cents,due_date,status,auto_charge,notes,points,pwa_installed_at,last_login_at,last_device,login_count,referral_code,referred_by,partner_id,partner_code,bonus_days,created_at",
      )
      .order("due_date", { ascending: true })
      .limit(2000),
    supabaseAdmin
      .from("payments")
      .select("id,client_id,amount_cents,method,paid_at,notes")
      .order("paid_at", { ascending: false })
      .limit(1000),
    supabaseAdmin
      .from("store_products")
      .select("id,user_id,key,label,sale_cents,cost_cents,duration_days,emoji,gradient,sort_order,active,image_url")
      .order("sort_order", { ascending: true }),
    getAdminSettingsRow(ownerId),
    fetchCatalogWithRpcFallback(ownerId),
  ]);

  const rawClients = (clientsRes.data ?? []) as any[];
  const clients = rawClients.map((c) => {
    const computedStatus = computeStatusSP(c.due_date, c.status, today);
    return {
      ...c,
      computed_status: computedStatus,
      due_today: c.due_date === today && c.status !== "suspenso" && c.status !== "cancelado",
      due_this_month:
        c.due_date >= today &&
        typeof c.due_date === "string" &&
        c.due_date.slice(0, 7) === monthPrefix &&
        c.status !== "suspenso" &&
        c.status !== "cancelado",
    };
  });

  const { plans, servers, purchases } = catalog;
  const planMap = new Map(plans.map((p: any) => [p.id, p]));
  const serverMap = new Map(servers.map((s: any) => [s.id, s]));
  const clientMap = new Map(clients.map((c: any) => [c.id, c]));

  const ativos = clients.filter((c) => c.computed_status === "ativo").length;
  const vencidos = clients.filter((c) => c.computed_status === "vencido").length;
  const suspensos = clients.filter((c) => c.computed_status === "suspenso" || c.computed_status === "cancelado").length;
  const hoje = clients.filter((c) => c.due_today).length;
  const mes = clients.filter((c) => c.due_this_month).length;
  const pwaInstalled = clients.filter((c) => Boolean(c.pwa_installed_at)).length;
  const iptvConfigured = clients.filter((c) => Boolean(c.iptv_login || c.iptv_password)).length;

  const kpis = {
    total: clients.length,
    ativos,
    vencidos,
    suspensos,
    hoje,
    mes,
    pwa_installed: pwaInstalled,
    pwa_not_installed: Math.max(0, clients.length - pwaInstalled),
    pwa_pct: clients.length ? Math.round((pwaInstalled * 100) / clients.length) : 0,
    iptv_configured: iptvConfigured,
  };

  const payments = (paymentsRes.data ?? []) as any[];

  const monthsForClient = (c: any) => {
    const p = c?.plan_id ? planMap.get(c.plan_id) : null;
    if (!p?.duration_days) return 1;
    return Math.max(1, Math.round(p.duration_days / 30));
  };

  const serverCostForClient = (clientId: string | null | undefined) => {
    if (!clientId) return 0;
    const c = clientMap.get(clientId);
    if (!c?.server_id) return 0;
    const srv = serverMap.get(c.server_id);
    return (srv?.credit_cost_cents ?? 0) * monthsForClient(c);
  };

  let receitaMes = 0;
  let despesaMes = 0;
  let totalClientesValor = 0;
  for (const c of clients) {
    totalClientesValor += c.price_cents ?? 0;
    if (c.computed_status !== "suspenso" && c.computed_status !== "cancelado") {
      receitaMes += c.price_cents ?? 0;
    }
    if (c.computed_status === "ativo" && c.server_id) {
      const srv = serverMap.get(c.server_id);
      despesaMes += (srv?.credit_cost_cents ?? 0) * monthsForClient(c);
    }
  }

  let lucroPagamentosMes = 0;
  let lucroAno = 0;
  let lucroTotal = 0;

  const monthKeyOf = (iso: string) => {
    const parts = iso.slice(0, 10).split("-");
    if (parts.length < 2) return "";
    return `${Number(parts[0])}-${Number(parts[1]) - 1}`;
  };
  const curYM = `${curYear}-${curMonthNum}`;

  for (const p of payments) {
    const profit = (p.amount_cents ?? 0) - serverCostForClient(p.client_id);
    lucroTotal += profit;
    if (Number((p.paid_at || "").slice(0, 4)) === curYear) lucroAno += profit;
    if (monthKeyOf(p.paid_at || "") === curYM) lucroPagamentosMes += profit;
  }

  let storeSalesTotal = 0;
  let storeCostTotal = 0;
  for (const s of purchases) {
    const sale = s.sale_cents ?? 0;
    const cost = s.cost_cents ?? 0;
    const profit = sale - cost;
    storeSalesTotal += sale;
    storeCostTotal += cost;
    lucroTotal += profit;
    if (Number((s.purchased_at || "").slice(0, 4)) === curYear) lucroAno += profit;
    if (monthKeyOf(s.purchased_at || "") === curYM) lucroPagamentosMes += profit;
  }

  const projecaoMes = receitaMes - despesaMes;

  const recentEntries = [
    ...payments.slice(0, 60).map((p) => ({
      id: `p-${p.id}`,
      kind: "IPTV" as const,
      name: clientMap.get(p.client_id)?.name ?? "Cliente",
      date: p.paid_at,
      method: p.method ?? "—",
      amount_cents: p.amount_cents ?? 0,
    })),
    ...purchases.slice(0, 60).map((s) => ({
      id: `s-${s.id}`,
      kind: "Loja" as const,
      name: s.buyer_name ?? clientMap.get(s.client_id ?? "")?.name ?? "Loja",
      date: s.purchased_at,
      method: s.label ?? s.product_key,
      amount_cents: s.sale_cents ?? 0,
    })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 50);

  const serverStats = servers.map((srv: any) => {
    const linked = clients.filter((c) => c.server_id === srv.id);
    const activeLinked = linked.filter((c) => c.computed_status === "ativo");
    return {
      ...srv,
      client_count: linked.length,
      active_count: activeLinked.length,
      monthly_cost_cents: activeLinked.reduce(
        (acc, c) => acc + (srv.credit_cost_cents ?? 0) * monthsForClient(c),
        0,
      ),
    };
  });

  const storeProducts = (storeProdsRes.data ?? []).map((p: any) => ({
    id: p.id,
    key: p.key,
    label: p.label,
    sale_cents: p.sale_cents ?? 0,
    cost_cents: p.cost_cents ?? 0,
    duration_days: p.duration_days ?? 30,
    emoji: p.emoji ?? "🛒",
    gradient: p.gradient ?? "from-emerald-500 to-teal-600",
    active: Boolean(p.active),
    image_url: p.image_url ?? null,
    sort_order: p.sort_order ?? 0,
  }));

  const safeSettings = {
    whatsapp_instance: settingsRow?.whatsapp_instance ?? "",
    support_message: settingsRow?.support_message ?? "",
    mp_access_token: settingsRow?.mp_access_token ?? "",
    telegram_bot_token: settingsRow?.telegram_bot_token ?? "",
    telegram_chat_id: settingsRow?.telegram_chat_id ?? "",
    zapi_instance_id: settingsRow?.zapi_instance_id ?? "",
    zapi_token: settingsRow?.zapi_token ?? "",
    zapi_client_token: settingsRow?.zapi_client_token ?? "",
    app_android_url: settingsRow?.app_android_url ?? "",
    app_ios_url: settingsRow?.app_ios_url ?? "",
    updates_movies_text: settingsRow?.updates_movies_text ?? "",
    updates_series_text: settingsRow?.updates_series_text ?? "",
    updates_games_text: settingsRow?.updates_games_text ?? "",
    store_slug: settingsRow?.store_slug ?? "",
    store_title: settingsRow?.store_title ?? "",
    store_description: settingsRow?.store_description ?? "",
    pix_key: settingsRow?.pix_key ?? "",
    pix_name: settingsRow?.pix_name ?? "",
    pix_bank: settingsRow?.pix_bank ?? "",
    referral_enabled: settingsRow?.referral_enabled ?? true,
    subscription_expires_at: settingsRow?.subscription_expires_at ?? null,
    subscription_monthly_cents: settingsRow?.subscription_monthly_cents ?? 0,
  };

  return {
    owner_user_id: ownerId,
    today,
    kpis,
    clients: clients.map((c) => ({
      ...c,
      plan_name: planMap.get(c.plan_id)?.name ?? null,
      server_name: serverMap.get(c.server_id)?.name ?? null,
      referred_by_code:
        c.partner_code ?? (c.referred_by ? clientMap.get(c.referred_by)?.referral_code ?? null : null),
    })),
    plans,
    servers: serverStats,
    store_products: storeProducts,
    store_purchases: purchases.slice(0, 50),
    finance: {
      receitaMes,
      despesaMes,
      lucroMes: lucroPagamentosMes > 0 ? lucroPagamentosMes : projecaoMes,
      lucroAno: lucroAno || projecaoMes,
      lucroTotal: lucroTotal || projecaoMes,
      totalClientesValor,
      paymentsCount: payments.length,
      storeStats: {
        sales: storeSalesTotal,
        cost: storeCostTotal,
        profit: storeSalesTotal - storeCostTotal,
        count: purchases.length,
      },
      recentEntries,
    },
    settings: safeSettings,
  };
}

export async function getZapiConfigFromSettings() {
  const s = await getAdminSettingsRow();
  const instance = (s?.zapi_instance_id || process.env.Z_API_INSTANCE_ID || "").trim();
  const token = (s?.zapi_token || process.env.Z_API_TOKEN || "").trim();
  const clientToken = (s?.zapi_client_token || process.env.Z_API_CLIENT_TOKEN || "").trim();
  if (!instance || !token) return null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;
  return {
    url: `https://api.z-api.io/instances/${instance}/token/${token}`,
    headers,
  };
}
