// Z-API WhatsApp helpers — server-only

export function buildChargeMessage(params: {
  identifier: string;
  dueDateISO: string;
}): string {
  const due = new Date(params.dueDateISO + "T00:00:00");
  const dd = String(due.getDate()).padStart(2, "0");
  const mm = String(due.getMonth() + 1).padStart(2, "0");
  const yyyy = due.getFullYear();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - due.getTime()) / 86400000);
  const overdue = Math.max(0, diffDays);
  return `Ola!  ${params.identifier} seu vencimento é: *${dd}/${mm}/${yyyy}  vencido há ${overdue}* dias. Aguardo contato para renovação`;
}

export function normalizeBrPhone(phone: string): string {
  const d = (phone || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length >= 12) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

async function getZapiCreds() {
  let instance = process.env.Z_API_INSTANCE_ID;
  let token = process.env.Z_API_TOKEN;
  let clientToken = process.env.Z_API_CLIENT_TOKEN;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("settings")
      .select("zapi_instance_id,zapi_token,zapi_client_token")
      .limit(1)
      .maybeSingle();
    if (data?.zapi_instance_id) instance = data.zapi_instance_id;
    if (data?.zapi_token) token = data.zapi_token;
    if (data?.zapi_client_token) clientToken = data.zapi_client_token;
  } catch {
    /* ignore */
  }
  return { instance, token, clientToken };
}

export async function sendZapiText(args: {
  phone: string;
  message: string;
}): Promise<{ ok: boolean; status: number; body: unknown }> {
  const { instance, token, clientToken } = await getZapiCreds();
  if (!instance || !token) {
    throw new Error("Z-API não configurada (Z_API_INSTANCE_ID/Z_API_TOKEN ausentes)");
  }
  const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone: args.phone, message: args.message }),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => null);
  }
  return { ok: res.ok, status: res.status, body };
}
