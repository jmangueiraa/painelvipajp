// Helper server-only: aplica um pagamento aprovado do Mercado Pago a uma assinatura.
// Usado pelo webhook público e pelo checkSubscriptionPayment (fallback do front).

type MpPayment = {
  id?: number | string;
  status?: string;
  external_reference?: string;
  transaction_amount?: number;
  date_approved?: string | null;
};

export async function applyApprovedSubscriptionPayment(payment: MpPayment) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const ref = payment.external_reference ?? "";
  if (!ref.startsWith("sub:")) return { skipped: "not a subscription" };
  const parts = ref.split(":");
  const userId = parts[1];
  const planId = parts[2];
  const days = Number(parts[3] || 30);
  const priceCents = Number(parts[4] || 0);
  if (!userId || !planId) return { skipped: "bad ref" };

  const mpId = String(payment.id);
  const paidAt = payment.date_approved ?? new Date().toISOString();
  const amountCents =
    priceCents || (payment.transaction_amount ? Math.round(payment.transaction_amount * 100) : 0);

  // idempotência: se já existe um pagamento com esse reference, pula
  const { data: dup } = await supabaseAdmin
    .from("app_subscription_payments")
    .select("id")
    .eq("user_id", userId)
    .eq("reference", mpId)
    .maybeSingle();
  if (dup) return { skipped: "already processed", paid_at: paidAt };

  const { data: sub } = await supabaseAdmin
    .from("app_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const now = new Date();
  const baseDate =
    sub?.current_period_end && new Date(sub.current_period_end) > now
      ? new Date(sub.current_period_end)
      : now;
  const nextEnd = new Date(baseDate);
  nextEnd.setUTCDate(nextEnd.getUTCDate() + days);

  let subscriptionId: string | null = sub?.id ?? null;
  if (sub) {
    await supabaseAdmin
      .from("app_subscriptions")
      .update({
        status: "ativa",
        plan_id: planId,
        price_cents: amountCents,
        payment_method: "pix",
        current_period_end: nextEnd.toISOString(),
        cancelled_at: null,
        started_at: sub.started_at ?? now.toISOString(),
      })
      .eq("id", sub.id);
  } else {
    const { data: inserted } = await supabaseAdmin
      .from("app_subscriptions")
      .insert({
        user_id: userId,
        plan_id: planId,
        price_cents: amountCents,
        payment_method: "pix",
        status: "ativa",
        started_at: now.toISOString(),
        current_period_end: nextEnd.toISOString(),
      })
      .select("id")
      .single();
    subscriptionId = inserted?.id ?? null;
  }

  if (!subscriptionId) return { skipped: "no subscription id" };
  const { error: payErr } = await supabaseAdmin.from("app_subscription_payments").insert({
    subscription_id: subscriptionId,
    user_id: userId,
    amount_cents: amountCents,
    method: "pix",
    paid_at: paidAt,
    reference: mpId,
    notes: `Mercado Pago PIX - ${days} dias`,
  });
  if (payErr) console.error("[mp-sub] payment insert failed", payErr);

  return { ok: true, paid_at: paidAt };
}
