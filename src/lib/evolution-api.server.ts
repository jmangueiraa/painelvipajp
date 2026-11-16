import type { SupabaseClient } from "@supabase/supabase-js";
import { evolutionConnected, evolutionRequest, normalizeEvolutionUrl, normalizeEvolutionInstance, type EvolutionConfig } from "./evolution-api";
export async function getEvolutionConfig(userId: string): Promise<EvolutionConfig | null> {
  if (!userId) throw new Error("Conta não identificada.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as SupabaseClient).from("evolution_integrations").select("base_url,instance_name,api_key").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Configuração Evolution indisponível. Aplique a configuração do banco antes de conectar.");
  return data?.base_url && data?.instance_name && data?.api_key ? data as EvolutionConfig : null;
}
export async function callEvolution(config: EvolutionConfig, action: "status" | "qr" | "disconnect" | "send", message?: { phone: string; message: string }) {
  const { url, init } = evolutionRequest(config, action, message);
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(`Falha na Evolution API (HTTP ${res.status}). Verifique URL, instância e chave de API.`);
  return body;
}
export async function evolutionConnectionAction(userId: string, action: "status" | "qr" | "disconnect") {
  const config = await getEvolutionConfig(userId);
  if (!config) return { configured: false, connected: false, image: null };
  if (action === "disconnect") { await callEvolution(config, action); return { ok: true }; }
  const connected = evolutionConnected(await callEvolution(config, "status"));
  if (action === "status" || connected) return { configured: true, connected, image: null };
  const qr = await callEvolution(config, "qr");
  const image = qr.base64 ?? qr.qrcode?.base64;
  return { configured: true, connected: false, image: typeof image === "string" ? (image.startsWith("data:image/") ? image : `data:image/png;base64,${image}`) : null };
}
export async function saveEvolutionConfig(userId: string, input: { base_url: string; instance_name: string; api_key?: string }) {
  const base_url = normalizeEvolutionUrl(input.base_url);
  const instance_name = normalizeEvolutionInstance(input.instance_name);
  const old = await getEvolutionConfig(userId);
  const api_key = input.api_key?.trim() || old?.api_key;
  if (!api_key) throw new Error("Informe a chave de API da Evolution.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as SupabaseClient).from("evolution_integrations").upsert({ user_id: userId, base_url, instance_name, api_key, updated_at: new Date().toISOString() });
  if (error) throw new Error("Não foi possível salvar a Evolution API. Verifique a configuração do banco.");
  return { ok: true };
}
export async function sendEvolutionText(args: { userId: string; phone: string; message: string }) {
  const config = await getEvolutionConfig(args.userId);
  if (!config) throw new Error("Evolution API não configurada para esta conta.");
  await callEvolution(config, "send", { phone: args.phone, message: args.message });
  return { ok: true, status: 200 };
}