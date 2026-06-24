import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MP_API = "https://api.mercadopago.com/v1/payments";

function getToken() {
  const t = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!t) throw new Error("Mercado Pago não configurado. Defina MERCADOPAGO_ACCESS_TOKEN.");
  if (t.startsWith("TEST-")) {
    throw new Error(
      "Access Token de TESTE detectado. Use o token de PRODUÇÃO do Mercado Pago (começa com APP_USR-).",
    );
  }
  return t;
}

export const createAppRenewalPix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ plan_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const token = getToken();
    const { supabase, userId } = context;

    const { data: plan, error: planErr } = await supabase
      .from("app_plans")
      .select("id,name,price_cents,duration_days,active")
      .eq("id", data.plan_id)
      .maybeSingle();
    if (planErr || !plan || !plan.active) throw new Error("Plano indisponível");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req, error: reqErr } = await supabaseAdmin
      .from("app_renewal_requests")
      .insert({
        user_id: userId,
        plan_id: plan.id,
        days: plan.duration_days,
        amount_cents: plan.price_cents,
        status: "awaiting_payment",
      })
      .select("id")
      .single();
    if (reqErr || !req) throw new Error("Falha ao registrar solicitação");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    const fullName = (profile as { full_name?: string } | null)?.full_name ?? "Assinante";

    const mpRes = await fetch(MP_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Idempotency-Key": req.id,
      },
      body: JSON.stringify({
        transaction_amount: Number((plan.price_cents / 100).toFixed(2)),
        description: `Renovação Painel - ${plan.name}`,
        payment_method_id: "pix",
        external_reference: req.id,
        payer: {
          email: `assinante.${userId.slice(0, 8)}@painelvip.app`,
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
      throw new Error(`Mercado Pago: ${mp.message ?? mpRes.statusText}`);
    }

    const qr_code = mp.point_of_interaction?.transaction_data?.qr_code ?? "";
    const qr_code_base64 = mp.point_of_interaction?.transaction_data?.qr_code_base64 ?? "";
    const mp_payment_id = mp.id ? String(mp.id) : null;

    await supabaseAdmin
      .from("app_renewal_requests")
      .update({
        mp_payment_id,
        mp_status: mp.status ?? "pending",
        pix_qr_code: qr_code,
        pix_qr_base64: qr_code_base64,
      })
      .eq("id", req.id);

    return {
      renewal_id: req.id,
      payment_id: mp_payment_id,
      qr_code,
      qr_code_base64,
      amount_cents: plan.price_cents,
      days: plan.duration_days,
      plan_name: plan.name,
    };
  });

export const checkAppRenewalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ renewal_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req } = await supabaseAdmin
      .from("app_renewal_requests")
      .select("id,user_id,plan_id,days,status,mp_payment_id,paid_at")
      .eq("id", data.renewal_id)
      .maybeSingle();
    if (!req || req.user_id !== userId) throw new Error("Solicitação não encontrada");

    if (req.status === "paid") return { status: "paid" as const };

    if (!req.mp_payment_id) return { status: req.status as string };

    const token = getToken();
    const mpRes = await fetch(`${MP_API}/${req.mp_payment_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const mp = (await mpRes.json().catch(() => ({}))) as { status?: string };

    await supabaseAdmin
      .from("app_renewal_requests")
      .update({ mp_status: mp.status ?? null })
      .eq("id", req.id);

    if (mp.status === "approved") {
      await applyApprovedRenewal(req.id);
      return { status: "paid" as const };
    }
    return { status: mp.status ?? "pending" };
  });

async function applyApprovedRenewal(renewal_id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: req } = await supabaseAdmin
    .from("app_renewal_requests")
    .select("id,user_id,days,amount_cents,status")
    .eq("id", renewal_id)
    .maybeSingle();
  if (!req || req.status === "paid") return;

  const { data: settings } = await supabaseAdmin
    .from("settings")
    .select("subscription_expires_at")
    .eq("user_id", req.user_id)
    .maybeSingle();

  const current = (settings as { subscription_expires_at?: string | null } | null)?.subscription_expires_at;
  const base = current && new Date(current).getTime() > Date.now() ? new Date(current) : new Date();
  base.setUTCDate(base.getUTCDate() + req.days);
  const newExpiry = base.toISOString().slice(0, 10);

  await supabaseAdmin
    .from("settings")
    .upsert({ user_id: req.user_id, subscription_expires_at: newExpiry }, { onConflict: "user_id" });

  await supabaseAdmin
    .from("app_renewal_requests")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", req.id);
}
