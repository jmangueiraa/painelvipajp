type PrioritySession = {
  is_admin?: boolean;
  isAdmin?: boolean;
  role?: string | null;
  client?: { id?: string; due_date?: string; status?: string; price_cents?: number } | null;
  plan?: { price_cents?: number } | null;
};

export function isPortalAdministrator(session: PrioritySession | undefined, token: string | null): boolean {
  const role = session?.role?.toLowerCase();
  return Boolean(token?.startsWith("adm.") || session?.is_admin || session?.isAdmin || role === "admin" || role === "adm" || role === "administrator");
}

/** The portal bills the current contract: future renewed periods are not overdue invoices. */
export function hasOutstandingPortalInvoice(session: PrioritySession | undefined, today: string): boolean {
  const client = session?.client;
  const due = client?.due_date;
  if (!client?.id || !due || !/^\d{4}-\d{2}-\d{2}$/.test(due) || !Number.isFinite(Date.parse(due))) return false;
  if (client.status === "cancelado" || client.status === "suspenso") return false;
  const amount = Number(client.price_cents ?? 0) > 0 ? Number(client.price_cents) : Number(session?.plan?.price_cents ?? 0);
  return Number.isFinite(amount) && amount > 0 && due <= today;
}

export function canShowPriorityPayment(input: {
  session: PrioritySession | undefined;
  token: string | null;
  sessionConfirmed: boolean;
  isLoading: boolean;
  invoicesLoading: boolean;
  today: string;
}): boolean {
  if (!input.token || !input.sessionConfirmed || input.isLoading || input.invoicesLoading) return false;
  if (isPortalAdministrator(input.session, input.token)) return false;
  return hasOutstandingPortalInvoice(input.session, input.today);
}