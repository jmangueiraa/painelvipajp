import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const cleanPass = password.trim();
  const cleanStored = stored.trim();
  if (cleanStored === cleanPass || cleanStored.toLowerCase() === cleanPass.toLowerCase()) return true;
  const parts = cleanStored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const [, salt, hash] = parts;
    const derived = scryptSync(cleanPass, salt, 64);
    const hashBuf = Buffer.from(hash, "hex");
    if (derived.length !== hashBuf.length) return false;
    return timingSafeEqual(derived, hashBuf);
  } catch {
    return false;
  }
}

export async function getClientByPortalUsername(username: string): Promise<PortalClient | null> {
  const { data, error } = await supabaseAdmin.rpc("find_client_by_portal_username", { _username: username });
  if (error || !data || !Array.isArray(data) || data.length === 0) return null;
  return data[0] as unknown as PortalClient;
}

export const SESSION_TTL_DAYS = 30;
export const OTP_TTL_MIN = 10;
export const OTP_MAX_ATTEMPTS = 5;

export function onlyDigits(s: string): string {
  return (s || "").replace(/\D/g, "");
}

export function normalizePhone(raw: string): string {
  const d = onlyDigits(raw);
  if (!d) return "";
  if (d.length >= 12) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function genOtp(): string {
  // 6 dígitos
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function genSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export type PortalClient = {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  due_date: string;
  status: string;
  price_cents: number;
  plan_id: string | null;
  server_id: string | null;
  iptv_login: string | null;
  iptv_password: string | null;
  referral_code: string | null;
  referred_by: string | null;
  bonus_days: number;
  points: number | null;
};

export async function getClientByPhone(phoneDigits: string): Promise<PortalClient | null> {
  // Compara apenas dígitos (ignora parênteses/espaços/traços do telefone salvo)
  const suffix = phoneDigits.slice(-8);
  const { data, error } = await supabaseAdmin.rpc("find_client_by_phone_digits", { _digits: phoneDigits });
  if (error || !data) return null;
  const list = data as PortalClient[];
  const match =
    list.find((c) => normalizePhone(c.phone) === phoneDigits) ??
    list.find((c) => onlyDigits(c.phone).endsWith(suffix));
  return (match as PortalClient) ?? null;
}

export async function getSessionFromRequest(request: Request, bodyToken?: string): Promise<PortalClient | null> {
  const auth = request.headers.get("authorization") || request.headers.get("Authorization");
  let token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : (auth || "").trim();
  if (!token) {
    token = (request.headers.get("x-portal-token") || request.headers.get("X-Portal-Token") || "").trim();
  }
  if (!token && bodyToken) {
    token = bodyToken.trim();
  }
  if (!token) {
    try {
      const url = new URL(request.url);
      token = (url.searchParams.get("token") || "").trim();
    } catch {}
  }
  if (!token) return null;

  // 1. Tenta buscar direto via RPC SECURITY DEFINER (ignora RLS)
  try {
    const { data: rpcClient, error: rpcErr } = await supabaseAdmin.rpc("portal_get_client_by_token", { _token: token });
    if (!rpcErr && rpcClient && typeof rpcClient === "object" && (rpcClient as any).id) {
      const c = rpcClient as PortalClient;
      if (!c.user_id) {
        const { data: s } = await supabaseAdmin.from("settings").select("user_id").limit(1).maybeSingle();
        if (s?.user_id) c.user_id = s.user_id;
      }
      return c;
    }
  } catch (ex) {
    console.warn("[getSessionFromRequest rpc client_by_token fallback]", ex);
  }

  // 2. Tenta via RPC portal_get_session
  try {
    const { data: rpcSess, error: rpcSessErr } = await supabaseAdmin.rpc("portal_get_session", { _token: token });
    if (!rpcSessErr && rpcSess && typeof rpcSess === "object" && (rpcSess as any).client) {
      const c = (rpcSess as any).client as PortalClient;
      if (!c.user_id) {
        const { data: clientRow } = await supabaseAdmin.from("clients").select("user_id").eq("id", c.id).maybeSingle();
        c.user_id = clientRow?.user_id ?? "";
      }
      if (!c.user_id) {
        const { data: s } = await supabaseAdmin.from("settings").select("user_id").limit(1).maybeSingle();
        if (s?.user_id) c.user_id = s.user_id;
      }
      return c;
    }
  } catch (ex) {
    console.warn("[getSessionFromRequest rpc get_session fallback]", ex);
  }

  // 3. Fallback via consulta direta às tabelas
  try {
    const hash = sha256(token);
    const { data: sess, error: sessErr } = await supabaseAdmin
      .from("portal_sessions")
      .select("client_id,expires_at")
      .eq("token_hash", hash)
      .maybeSingle();

    if (sessErr) console.warn("[portal_sessions query error]", sessErr);
    if (!sess) return null;
    if (new Date(sess.expires_at).getTime() < Date.now()) return null;

    await supabaseAdmin.from("portal_sessions").update({ last_seen_at: new Date().toISOString() }).eq("token_hash", hash);
    const { data: c, error: clientErr } = await supabaseAdmin
      .from("clients")
      .select("id,user_id,name,phone,due_date,status,price_cents,plan_id,server_id,iptv_login,iptv_password,referral_code,referred_by,bonus_days,points")
      .eq("id", sess.client_id)
      .maybeSingle();

    if (clientErr) console.warn("[clients query error]", clientErr);
    if (!c) return null;

    const resClient = c as PortalClient;
    if (!resClient.user_id) {
      const { data: s } = await supabaseAdmin.from("settings").select("user_id").limit(1).maybeSingle();
      if (s?.user_id) resClient.user_id = s.user_id;
    }
    return resClient;
  } catch (e) {
    console.error("[getSessionFromRequest error]", e);
    return null;
  }
}

export async function sendWhatsappOtp(phoneDigits: string, code: string, clientName: string): Promise<void> {
  const instance = process.env.Z_API_INSTANCE_ID;
  const token = process.env.Z_API_TOKEN;
  if (!instance || !token) throw new Error("Z-API não configurada");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const clientToken = process.env.Z_API_CLIENT_TOKEN;
  if (clientToken) headers["Client-Token"] = clientToken;
  const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
  const message = `Olá ${clientName}! Seu código de acesso ao portal é: *${code}*\nVálido por ${OTP_TTL_MIN} minutos.`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone: phoneDigits, message }),
  });
  const txt = await res.text().catch(() => "");
  console.log("[portal] Z-API send-text", { status: res.status, phone: phoneDigits, body: txt.slice(0, 500) });
  if (!res.ok) {
    throw new Error(`Falha ao enviar WhatsApp: ${res.status} ${txt}`);
  }
  // Z-API retorna 200 mesmo em erro; checar body
  try {
    const json = JSON.parse(txt);
    if (json?.error || json?.value === false) {
      throw new Error(`Z-API erro: ${txt}`);
    }
  } catch (e) {
    if ((e as Error).message?.startsWith("Z-API erro")) throw e;
  }
}
