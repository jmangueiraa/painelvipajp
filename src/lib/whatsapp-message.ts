/**
 * Helpers compartilhados (client + server) para formatação e abertura
 * de mensagens de aviso de vencimento e suporte no WhatsApp.
 */

export function normalizeBrPhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return "";
  if (digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function buildChargeMessage(params: {
  identifier: string;
  dueDateISO?: string | null;
  login?: string | null;
  password?: string | null;
}): string {
  const cleanIdentifier = (params.login || params.identifier || "").trim() || "Cliente";
  const cleanIso = (params.dueDateISO || "").trim().slice(0, 10);
  const due = /^\d{4}-\d{2}-\d{2}$/.test(cleanIso) ? new Date(`${cleanIso}T00:00:00`) : null;

  const userVal = (params.login || params.identifier || "").trim();
  const credLines: string[] = [];
  if (userVal) credLines.push(`👤 *Usuário:* ${userVal}`);
  if (params.password) credLines.push(`🔑 *Senha:* ${params.password}`);
  const credBlock = credLines.length ? `\n\n${credLines.join("\n")}` : "";

  if (!due || Number.isNaN(due.getTime())) {
    return `⚠️ *Aviso de Vencimento*\n\nOlá! Renove seu acesso *(${cleanIdentifier})* para evitar a interrupção do serviço.\n\n*Acesse o portal:*\n🌐 https://portalajp.com.br/portal${credBlock}\n\n*Pagou, liberou!* A reativação é automática logo após a confirmação. Obrigado pela preferência! 😊`;
  }

  const dd = String(due.getDate()).padStart(2, "0");
  const mm = String(due.getMonth() + 1).padStart(2, "0");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);

  let header: string;
  let actionLine: string;
  if (diffDays > 0) {
    header = `⚠️ Aviso de Vencimento: *Faltam ${diffDays} ${diffDays === 1 ? "dia" : "dias"}!*`;
    actionLine = `Olá! Seu acesso *(${cleanIdentifier})* expira em *${dd}/${mm}*. Renove agora para evitar a interrupção do serviço.`;
  } else if (diffDays === 0) {
    header = `⚠️ Aviso de Vencimento: *Vence HOJE!*`;
    actionLine = `Olá! Seu acesso *(${cleanIdentifier})* expira *HOJE (${dd}/${mm})*. Renove agora para evitar a interrupção do serviço.`;
  } else {
    const overdue = Math.abs(diffDays);
    header = `⚠️ Aviso de Vencimento: *Vencido há ${overdue} ${overdue === 1 ? "dia" : "dias"}!*`;
    actionLine = `Olá! Seu acesso *(${cleanIdentifier})* expirou em *${dd}/${mm}*. Renove agora para evitar a interrupção do serviço.`;
  }

  return `${header}\n\n\n${actionLine}\n\n\n*Acesse o portal:*\n🌐 https://portalajp.com.br/portal${credBlock}\n\n*Pagou, liberou!* A reativação é automática logo após a confirmação. Obrigado pela preferência! 😊`;
}

export function buildWhatsAppHref(phone: string, message?: string): string {
  const full = normalizeBrPhone(phone);
  if (!full) return "#";
  const text = message?.trim();
  if (!text) return `https://wa.me/${full}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

/**
 * No Android, prioriza abrir diretamente no WhatsApp Business com fallback automático
 * para wa.me mantendo o texto codificado na URL.
 */
export function handleAndroidWhatsAppIntent(phone: string, message?: string): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  if (!/Android/i.test(navigator.userAgent)) return false;

  const full = normalizeBrPhone(phone);
  if (!full) return false;

  const text = message?.trim();
  const encodedMsg = text ? encodeURIComponent(text) : "";
  const query = encodedMsg ? `phone=${full}&text=${encodedMsg}` : `phone=${full}`;
  const fallback = buildWhatsAppHref(phone, message);
  const intentUrl = `intent://send?${query}#Intent;scheme=whatsapp;package=com.whatsapp.w4b;S.browser_fallback_url=${encodeURIComponent(fallback)};end`;

  try {
    window.location.href = intentUrl;
    return true;
  } catch {
    return false;
  }
}
