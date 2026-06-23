import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listMyPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("app_plans")
      .select("id, name, description, price_cents, duration_days, featured")
      .eq("active", true)
      .order("price_cents", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: sub }, { data: plans }, { data: payments }] = await Promise.all([
      supabaseAdmin.from("app_subscriptions").select("*").eq("user_id", context.userId).maybeSingle(),
      supabaseAdmin.from("app_plans").select("id, name, price_cents, duration_days").eq("active", true).order("price_cents", { ascending: true }),
      supabaseAdmin
        .from("app_subscription_payments")
        .select("id, paid_at, amount_cents, method, reference, notes")
        .eq("user_id", context.userId)
        .order("paid_at", { ascending: false })
        .limit(20),
    ]);
    return { subscription: sub, plans: plans ?? [], payments: payments ?? [] };
  });

export const createSubscriptionPix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { planId: string }) =>
    z.object({ planId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) throw new Error("Mercado Pago não configurado");
    if (token.startsWith("TEST-")) {
      throw new Error(
        "Access Token de TESTE detectado. Use o token de PRODUÇÃO do Mercado Pago (começa com APP_USR-).",
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: plan, error: planErr } = await supabaseAdmin
      .from("app_plans")
      .select("id, name, price_cents, duration_days, active")
      .eq("id", data.planId)
      .maybeSingle();
    if (planErr) throw planErr;
    if (!plan || !plan.active) throw new Error("Plano indisponível");
    if (!plan.price_cents || plan.price_cents < 100) throw new Error("Plano com valor inválido");

    // dados do usuário
    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = userRes.user?.email ?? `assinante.${context.userId.slice(0, 8)}@painelvip.app`;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const fullName = profile?.full_name || userRes.user?.email?.split("@")[0] || "Assinante";

    const externalReference = `sub:${context.userId}:${plan.id}:${plan.duration_days}:${plan.price_cents}`;
    const idempotencyKey = `sub-${context.userId}-${plan.id}-${Date.now()}`;
    const amount = plan.price_cents / 100;

    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        transaction_amount: Number(amount.toFixed(2)),
        description: `Assinatura ${plan.name} - Painel VIP`,
        payment_method_id: "pix",
        external_reference: externalReference,
        payer: {
          email,
          first_name: fullName.split(" ")[0] || "Assinante",
          last_name: fullName.split(" ").slice(1).join(" ") || "VIP",
        },
      }),
    });
    const mp = (await mpRes.json().catch(() => ({}))) as {
      id?: number | string;
      status?: string;
      message?: string;
      point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
    };
    if (!mpRes.ok) {
      throw new Error(`Falha no Mercado Pago: ${mp.message ?? mpRes.statusText}`);
    }

    return {
      payment_id: mp.id ? String(mp.id) : null,
      qr_code: mp.point_of_interaction?.transaction_data?.qr_code ?? "",
      qr_code_base64: mp.point_of_interaction?.transaction_data?.qr_code_base64 ?? "",
      amount_cents: plan.price_cents,
      plan_id: plan.id,
    };
  });

export const checkSubscriptionPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { paymentId: string }) =>
    z.object({ paymentId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) throw new Error("Mercado Pago não configurado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // se já registramos esse pagamento, retorna pago
    const { data: existing } = await supabaseAdmin
      .from("app_subscription_payments")
      .select("id, paid_at")
      .eq("user_id", context.userId)
      .eq("reference", String(data.paymentId))
      .maybeSingle();
    if (existing) return { paid: true, paid_at: existing.paid_at };

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.paymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!mpRes.ok) return { paid: false, status: "unknown" as string };
    const payment = (await mpRes.json()) as {
      id?: number | string;
      status?: string;
      external_reference?: string;
      transaction_amount?: number;
      date_approved?: string | null;
    };
    if (payment.status !== "approved") return { paid: false, status: payment.status ?? "pending" };

    await applyApprovedPayment(supabaseAdmin, payment);
    return { paid: true, paid_at: payment.date_approved ?? new Date().toISOString() };
  });

// Função auxiliar reutilizada pelo webhook (não exportada via server fn)
async function applyApprovedPayment(
  supabaseAdmin: any,
  payment: {
    id?: number | string;
    status?: string;
    external_reference?: string;
    transaction_amount?: number;
    date_approved?: string | null;
  },
) {
  const ref = payment.external_reference ?? "";
  if (!ref.startsWith("sub:")) return { skipped: "not a subscription" };
  const parts = ref.split(":");
  // sub:userId:planId:days:price_cents
  const userId = parts[1];
  const planId = parts[2];
  const days = Number(parts[3] || 30);
  const priceCents = Number(parts[4] || 0);
  if (!userId || !planId) return { skipped: "bad ref" };

  const mpId = String(payment.id);
  const paidAt = payment.date_approved ?? new Date().toISOString();
  const amountCents =
    priceCents || (payment.transaction_amount ? Math.round(payment.transaction_amount * 100) : 0);

  // idempotência: se já existe um payment com esse reference, pula
  const { data: dup } = await supabaseAdmin
    .from("app_subscription_payments")
    .select("id")
    .eq("user_id", userId)
    .eq("reference", mpId)
    .maybeSingle();
  if (dup) return { skipped: "already processed" };

  // upsert assinatura
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

  let subscriptionId = sub?.id ?? null;
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

  return { ok: true };
}

export { applyApprovedPayment };
