import { createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

export async function getSessionFromRequest(request: Request): Promise<PortalClient | null> {
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const hash = sha256(token);
  const { data: sess } = await supabaseAdmin
    .from("portal_sessions")
    .select("client_id,expires_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!sess) return null;
  if (new Date(sess.expires_at).getTime() < Date.now()) return null;
  await supabaseAdmin.from("portal_sessions").update({ last_seen_at: new Date().toISOString() }).eq("token_hash", hash);
  const { data: c } = await supabaseAdmin
    .from("clients")
    .select("id,user_id,name,phone,due_date,status,price_cents,plan_id,server_id,iptv_login,iptv_password,referral_code,referred_by,bonus_days")
    .eq("id", sess.client_id)
    .maybeSingle();
  return (c as PortalClient) ?? null;
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
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Falha ao enviar WhatsApp: ${res.status} ${txt}`);
  }
}
