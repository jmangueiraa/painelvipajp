// Server-only: envia notificações para o Telegram conforme a Central de Notificações.

export type NotifyEvent =
  | "new_sale"
  | "payment_approved"
  | "renewal"
  | "new_client"
  | "trial"
  | "payment_rejected";

const EVENT_TO_FLAG: Record<NotifyEvent, string> = {
  new_sale: "notify_new_sale",
  payment_approved: "notify_payment_approved",
  renewal: "notify_renewal",
  new_client: "notify_new_client",
  trial: "notify_trial",
  payment_rejected: "notify_payment_rejected",
};

const EVENT_TITLE: Record<NotifyEvent, string> = {
  new_sale: "💰 NOVA VENDA",
  payment_approved: "✅ PAGAMENTO APROVADO",
  renewal: "🔁 RENOVAÇÃO REALIZADA",
  new_client: "🆕 NOVO CLIENTE CADASTRADO",
  trial: "🎁 TESTE GRATUITO CRIADO",
  payment_rejected: "❌ PAGAMENTO RECUSADO",
};

export interface NotifyPayload {
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  plano?: string | null;
  valor?: string | null; // já formatado em reais ex "64,00"
  metodo?: string | null;
  data?: string | null; // já formatada
  extra?: string | null;
}

function fmtDateBR(d: Date) {
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
}

export function buildMessage(event: NotifyEvent, p: NotifyPayload): string {
  const lines: string[] = [EVENT_TITLE[event], ""];
  if (p.nome) lines.push(`👤 Cliente: ${p.nome}`);
  if (p.telefone) lines.push(`📱 Telefone: ${p.telefone}`);
  if (p.email) lines.push(`📧 Email: ${p.email}`);
  if (p.plano) lines.push(`📦 Plano: ${p.plano}`);
  if (p.valor) lines.push(`💵 Valor: R$ ${p.valor}`);
  if (p.metodo) lines.push(`💳 Pagamento: ${p.metodo}`);
  if (p.extra) lines.push(p.extra);
  lines.push(`🕒 Data: ${p.data ?? fmtDateBR(new Date())}`);
  return lines.join("\n");
}

export async function notify(event: NotifyEvent, payload: NotifyPayload): Promise<{ ok: boolean; reason?: string }> {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
    if (!token || !chatId) return { ok: false, reason: "telegram não configurado" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cfg } = await supabaseAdmin
      .from("notifications_config")
      .select("*")
      .eq("id", "global")
      .maybeSingle();

    const flag = EVENT_TO_FLAG[event];
    const enabled = cfg ? ((cfg as Record<string, unknown>)[flag] ?? true) === true : true;
    if (!enabled) return { ok: false, reason: "evento desativado" };

    const text = buildMessage(event, payload);
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.error("[telegram] send failed", r.status, body);
      return { ok: false, reason: `http ${r.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[telegram] error", e);
    return { ok: false, reason: (e as Error).message };
  }
}
