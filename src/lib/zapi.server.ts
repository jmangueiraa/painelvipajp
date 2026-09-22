// Z-API WhatsApp helpers — server-only

export function buildChargeMessage(params: {
  identifier: string;
  dueDateISO: string;
  login?: string | null;
  password?: string | null;
}): string {
  const due = new Date(params.dueDateISO + "T00:00:00");
  const dd = String(due.getDate()).padStart(2, "0");
  const mm = String(due.getMonth() + 1).padStart(2, "0");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  const identifier = params.login || params.identifier;

  let header: string;
  let actionLine: string;
  if (diffDays > 0) {
    header = `⚠️ Aviso de Vencimento: *Faltam ${diffDays} ${diffDays === 1 ? "dia" : "dias"}!*`;
    actionLine = `Olá! Seu acesso *(${identifier})* expira em *${dd}/${mm}*. Renove agora para evitar a interrupção do serviço.`;
  } else if (diffDays === 0) {
    header = `⚠️ Aviso de Vencimento: *Vence HOJE!*`;
    actionLine = `Olá! Seu acesso *(${identifier})* expira *HOJE (${dd}/${mm})*. Renove agora para evitar a interrupção do serviço.`;
  } else {
    const overdue = Math.abs(diffDays);
    header = `⚠️ Aviso de Vencimento: *Vencido há ${overdue} ${overdue === 1 ? "dia" : "dias"}!*`;
    actionLine = `Olá! Seu acesso *(${identifier})* expirou em *${dd}/${mm}*. Renove agora para evitar a interrupção do serviço.`;
  }

  const userVal = params.login || params.identifier;
  const credLines: string[] = [];
  if (userVal) credLines.push(`👤 *Usuário:* ${userVal}`);
  if (params.password) credLines.push(`🔑 *Senha:* ${params.password}`);
  const credBlock = credLines.length ? `\n\n${credLines.join("\n")}` : "";

  return `${header}\n\n\n${actionLine}\n\n\n*Acesse o portal:*\n🌐 https://portalajp.com.br/portal${credBlock}\n\n*Pagou, liberou!* A reativação é automática logo após a confirmação. Obrigado pela preferência! 😊`;
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
