import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


const MP_API = "https://api.mercadopago.com/v1/payments";
const MP_PREF_API = "https://api.mercadopago.com/checkout/preferences";
const MP_SEARCH_API = "https://api.mercadopago.com/v1/payments/search";

// Taxa do cartão (Mercado Pago ~4.99% para 1x). Repassada ao assinante.
export const CARD_FEE_PERCENT = 4.99;

function applyCardFee(price_cents: number) {
  return Math.ceil(price_cents / (1 - CARD_FEE_PERCENT / 100));
}

function getToken() {
  const t = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() ?? "";
  if (!t) throw new Error("Mercado Pago não configurado.");
  if (t.startsWith("TEST-")) {
    throw new Error(
      "Access Token de TESTE detectado. Use o token de PRODUÇÃO do Mercado Pago (começa com APP_USR-).",
    );
  }
  return t;
}

async function getOrigin() {
  try {
    const mod = await import("@tanstack/react-start/server");
    const proto = mod.getRequestHeader("x-forwarded-proto") ?? "https";
    const host = mod.getRequestHost();
    if (host) return `${proto}://${host}`;
  } catch {
    // ignore
  }
  return "https://painelvipajp.lovable.app";
}

export const createAppRenewalPix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ plan_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const token = getToken();

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

export const createAppRenewalCardCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ plan_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const token = getToken();

    const { data: plan, error: planErr } = await supabase
      .from("app_plans")
      .select("id,name,price_cents,duration_days,active")
      .eq("id", data.plan_id)
      .maybeSingle();
    if (planErr || !plan || !plan.active) throw new Error("Plano indisponível");

    const amount_with_fee = applyCardFee(plan.price_cents);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req, error: reqErr } = await supabaseAdmin
      .from("app_renewal_requests")
      .insert({
        user_id: userId,
        plan_id: plan.id,
        days: plan.duration_days,
        amount_cents: amount_with_fee,
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

    const origin = await getOrigin();
    const back = `${origin}/renovacao`;

    const mpRes = await fetch(MP_PREF_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Idempotency-Key": req.id,
      },
      body: JSON.stringify({
        items: [
          {
            id: plan.id,
            title: `Renovação Painel - ${plan.name}`,
            description: `${plan.duration_days} dias de assinatura`,
            quantity: 1,
            currency_id: "BRL",
            unit_price: Number((amount_with_fee / 100).toFixed(2)),
          },
        ],
        payment_methods: {
          excluded_payment_types: [{ id: "ticket" }, { id: "atm" }, { id: "bank_transfer" }],
          installments: 12,
        },
        external_reference: req.id,
        notification_url: `${origin}/api/public/app/mp-webhook`,
        back_urls: { success: back, pending: back, failure: back },
        statement_descriptor: "PAINELVIP",
      }),
    });

    const mp = (await mpRes.json().catch(() => ({}))) as {
      id?: string;
      init_point?: string;
      sandbox_init_point?: string;
      message?: string;
      error?: string;
      cause?: Array<{ code?: string | number; description?: string }>;
    };
    if (!mpRes.ok || !mp.init_point) {
      const detail =
        mp.cause?.map((c) => c.description).filter(Boolean).join("; ") ||
        mp.message ||
        mp.error ||
        mpRes.statusText;
      console.error("[app-renewal] MP error", mpRes.status, JSON.stringify(mp));
      throw new Error(`Mercado Pago: ${detail}`);
    }

    await supabaseAdmin
      .from("app_renewal_requests")
      .update({ mp_status: "pending" })
      .eq("id", req.id);

    return {
      renewal_id: req.id,
      init_point: mp.init_point,
      amount_cents: amount_with_fee,
      base_cents: plan.price_cents,
      days: plan.duration_days,
      plan_name: plan.name,
    };
  });

export const createAppRenewalCardDirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        plan_id: z.string().uuid(),
        card_data: z.object({
          card_number: z.string(),
          cardholder_name: z.string(),
          expiration_month: z.number(),
          expiration_year: z.number(),
          security_code: z.string(),
          cpf: z.string(),
          installments: z.number().optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const token = getToken();

    const { data: plan, error: planErr } = await supabase
      .from("app_plans")
      .select("id,name,price_cents,duration_days,active")
      .eq("id", data.plan_id)
      .maybeSingle();
    if (planErr || !plan || !plan.active) throw new Error("Plano indisponível");

    const amount_with_fee = applyCardFee(plan.price_cents);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req, error: reqErr } = await supabaseAdmin
      .from("app_renewal_requests")
      .insert({
        user_id: userId,
        plan_id: plan.id,
        days: plan.duration_days,
        amount_cents: amount_with_fee,
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
    const clientNameParts = fullName.trim().split(" ");
    const firstName = clientNameParts[0] || "Assinante";
    const lastName = clientNameParts.slice(1).join(" ") || "VIP";

    const { detectCardBrand, createMpCardToken, createMpDirectCardPayment } = await import(
      "@/lib/mercadopago-card.server"
    );

    const tokenRes = await createMpCardToken(token, data.card_data);
    if (!tokenRes.token) {
      await supabaseAdmin.from("app_renewal_requests").update({ mp_status: "token_failed" }).eq("id", req.id);
      throw new Error(tokenRes.error || "Dados do cartão inválidos");
    }

    const origin = await getOrigin();
    const brand = detectCardBrand(data.card_data.card_number);

    const payRes = await createMpDirectCardPayment(token, {
      cardToken: tokenRes.token,
      amountCents: amount_with_fee,
      description: `Renovação Painel - ${plan.name}`,
      externalReference: req.id,
      installments: data.card_data.installments || 1,
      paymentMethodId: brand,
      payer: {
        email: `assinante.${userId.slice(0, 8)}@painelvip.app`,
        cpf: data.card_data.cpf,
        firstName,
        lastName,
      },
      notificationUrl: `${origin}/api/public/app/mp-webhook`,
    });

    if (payRes.status === "approved") {
      await supabaseAdmin
        .from("app_renewal_requests")
        .update({
          mp_payment_id: payRes.payment_id ? String(payRes.payment_id) : undefined,
          mp_status: "approved",
        })
        .eq("id", req.id);
      await applyApprovedRenewal(req.id);

      return {
        ok: true,
        status: "approved" as const,
        renewal_id: req.id,
        payment_id: payRes.payment_id,
        amount_cents: amount_with_fee,
        base_cents: plan.price_cents,
        days: plan.duration_days,
        plan_name: plan.name,
        message: "Pagamento aprovado com sucesso!",
      };
    }

    if (payRes.status === "in_process") {
      await supabaseAdmin
        .from("app_renewal_requests")
        .update({
          mp_payment_id: payRes.payment_id ? String(payRes.payment_id) : undefined,
          mp_status: "in_process",
        })
        .eq("id", req.id);

      return {
        ok: true,
        status: "in_process" as const,
        renewal_id: req.id,
        payment_id: payRes.payment_id,
        amount_cents: amount_with_fee,
        base_cents: plan.price_cents,
        days: plan.duration_days,
        plan_name: plan.name,
        message: payRes.message,
      };
    }

    await supabaseAdmin
      .from("app_renewal_requests")
      .update({
        mp_payment_id: payRes.payment_id ? String(payRes.payment_id) : undefined,
        mp_status: payRes.status_detail || "rejected",
      })
      .eq("id", req.id);

    throw new Error(payRes.message || "Pagamento recusado pelo emissor do cartão.");
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

    const token = getToken();

    let paymentId = req.mp_payment_id as string | null;
    let mpStatus: string | undefined;

    if (!paymentId) {
      const searchRes = await fetch(
        `${MP_SEARCH_API}?external_reference=${encodeURIComponent(req.id)}&sort=date_created&criteria=desc&limit=1`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const search = (await searchRes.json().catch(() => ({}))) as {
        results?: Array<{ id?: number | string; status?: string }>;
      };
      const first = search.results?.[0];
      if (first?.id) {
        paymentId = String(first.id);
        mpStatus = first.status;
        await supabaseAdmin
          .from("app_renewal_requests")
          .update({ mp_payment_id: paymentId, mp_status: mpStatus ?? null })
          .eq("id", req.id);
      } else {
        return { status: req.status as string };
      }
    } else {
      const mpRes = await fetch(`${MP_API}/${paymentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const mp = (await mpRes.json().catch(() => ({}))) as { status?: string };
      mpStatus = mp.status;
      await supabaseAdmin
        .from("app_renewal_requests")
        .update({ mp_status: mpStatus ?? null })
        .eq("id", req.id);
    }

    if (mpStatus === "approved") {
      await applyApprovedRenewal(req.id);
      return { status: "paid" as const };
    }
    return { status: mpStatus ?? "pending" };
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

  const { count: paidCount } = await supabaseAdmin
    .from("app_renewal_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", req.user_id)
    .eq("status", "paid");

  const current = (settings as { subscription_expires_at?: string | null } | null)?.subscription_expires_at;
  const hasPaidBefore = (paidCount ?? 0) > 0;
  const base = hasPaidBefore && current && new Date(current).getTime() > Date.now()
    ? new Date(current)
    : new Date();
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
