import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error("Falha ao validar permissões");
  if (!data) throw new Error("Acesso restrito a administradores");
}

export type SubscriberRow = {
  user_id: string;
  full_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  account_created_at: string;
  last_sign_in_at: string | null;
  subscription: {
    id: string | null;
    status: string | null;
    plan_id: string | null;
    plan_name: string | null;
    price_cents: number;
    started_at: string | null;
    current_period_end: string | null;
    payment_method: string | null;
    cancelled_at: string | null;
  };
  last_payment: {
    paid_at: string | null;
    amount_cents: number | null;
    method: string | null;
  } | null;
};

export const listSubscribers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [
      { data: profiles, error: pErr },
      { data: subs, error: sErr },
      { data: plans, error: plErr },
      { data: pays, error: payErr },
      { data: settingsRows, error: setErr },
      { data: renewals, error: renErr },
      { data: adminRoles, error: arErr },
      usersRes,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, company_name, phone, created_at"),
      supabaseAdmin.from("app_subscriptions").select("*"),
      supabaseAdmin.from("app_plans").select("id, name"),
      supabaseAdmin.from("app_subscription_payments").select("user_id, paid_at, amount_cents, method").order("paid_at", { ascending: false }),
      supabaseAdmin.from("settings").select("user_id, subscription_expires_at, subscription_monthly_cents, created_at"),
      supabaseAdmin.from("app_renewal_requests").select("user_id, paid_at, amount_cents, plan_id, status").eq("status", "paid").order("paid_at", { ascending: false }),
      supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin"),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (pErr) throw pErr;
    if (sErr) throw sErr;
    if (plErr) throw plErr;
    if (payErr) throw payErr;
    if (setErr) throw setErr;
    if (renErr) throw renErr;
    if (arErr) throw arErr;
    if (usersRes.error) throw usersRes.error;

    const adminSet = new Set((adminRoles ?? []).map((r) => r.user_id));
    const planMap = new Map((plans ?? []).map((p) => [p.id, p.name]));
    const subMap = new Map((subs ?? []).map((s) => [s.user_id, s]));
    const settingsMap = new Map((settingsRows ?? []).map((s) => [s.user_id, s]));
    const userMap = new Map(usersRes.data.users.map((u) => [u.id, u]));
    const lastPayMap = new Map<string, any>();
    for (const p of pays ?? []) {
      if (!lastPayMap.has(p.user_id)) lastPayMap.set(p.user_id, p);
    }
    const lastRenMap = new Map<string, any>();
    for (const r of renewals ?? []) {
      if (!lastRenMap.has(r.user_id)) lastRenMap.set(r.user_id, r);
    }

    const now = Date.now();

    const rows: SubscriberRow[] = (profiles ?? []).filter((p) => !adminSet.has(p.id)).map((p) => {
      const sub = subMap.get(p.id);
      const set = settingsMap.get(p.id);
      const u = userMap.get(p.id);
      const lastPay = lastPayMap.get(p.id);
      const lastRen = lastRenMap.get(p.id);

      const expiresAt = sub?.current_period_end ?? set?.subscription_expires_at ?? null;
      const priceCents = sub?.price_cents ?? set?.subscription_monthly_cents ?? 0;
      const startedAt = sub?.started_at ?? set?.created_at ?? p.created_at ?? null;

      let status: string | null = sub?.status ?? null;
      if (!status) {
        if (!expiresAt) status = "pendente";
        else status = new Date(expiresAt).getTime() >= now ? "ativa" : "vencida";
      }

      const planId = sub?.plan_id ?? lastRen?.plan_id ?? null;
      const planName = planId ? planMap.get(planId) ?? null : null;

      const renPayAt = lastRen?.paid_at ? new Date(lastRen.paid_at).getTime() : 0;
      const subPayAt = lastPay?.paid_at ? new Date(lastPay.paid_at).getTime() : 0;
      const useRen = renPayAt && renPayAt >= subPayAt;
      const last_payment = useRen
        ? { paid_at: lastRen.paid_at, amount_cents: lastRen.amount_cents ?? 0, method: "pix" }
        : lastPay
        ? { paid_at: lastPay.paid_at, amount_cents: lastPay.amount_cents ?? 0, method: lastPay.method }
        : null;

      return {
        user_id: p.id,
        full_name: p.full_name,
        company_name: p.company_name,
        email: u?.email ?? null,
        phone: p.phone ?? (u?.phone ?? null),
        account_created_at: p.created_at,
        last_sign_in_at: u?.last_sign_in_at ?? null,
        subscription: {
          id: sub?.id ?? null,
          status,
          plan_id: planId,
          plan_name: planName,
          price_cents: priceCents,
          started_at: startedAt,
          current_period_end: expiresAt,
          payment_method: sub?.payment_method ?? (useRen ? "pix" : null),
          cancelled_at: sub?.cancelled_at ?? null,
        },
        last_payment,
      };
    });

    return rows;
  });

export const getSubscriberDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profile, error: pErr }, { data: sub, error: sErr }, { data: payments, error: payErr }, userRes, { data: plans }] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", data.userId).maybeSingle(),
      supabaseAdmin.from("app_subscriptions").select("*").eq("user_id", data.userId).maybeSingle(),
      supabaseAdmin.from("app_subscription_payments").select("*").eq("user_id", data.userId).order("paid_at", { ascending: false }),
      supabaseAdmin.auth.admin.getUserById(data.userId),
      supabaseAdmin.from("app_plans").select("id, name, price_cents, duration_days"),
    ]);
    if (pErr) throw pErr;
    if (sErr) throw sErr;
    if (payErr) throw payErr;
    if (userRes.error) throw userRes.error;

    return {
      profile,
      subscription: sub,
      payments: payments ?? [],
      auth: {
        email: userRes.data.user?.email ?? null,
        phone: userRes.data.user?.phone ?? null,
        created_at: userRes.data.user?.created_at ?? null,
        last_sign_in_at: userRes.data.user?.last_sign_in_at ?? null,
      },
      plans: plans ?? [],
    };
  });

export const updateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    userId: string;
    status?: string;
    planId?: string | null;
    priceCents?: number;
    currentPeriodEnd?: string | null;
    paymentMethod?: string | null;
  }) =>
    z
      .object({
        userId: z.string().uuid(),
        status: z.enum(["ativa", "pendente", "cancelada", "vencida", "teste_gratis"]).optional(),
        planId: z.string().uuid().nullable().optional(),
        priceCents: z.number().int().nonnegative().optional(),
        currentPeriodEnd: z.string().nullable().optional(),
        paymentMethod: z.enum(["pix", "cartao", "boleto", "dinheiro", "manual", "outro"]).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // upsert subscription
    const { data: existing } = await supabaseAdmin
      .from("app_subscriptions")
      .select("id")
      .eq("user_id", data.userId)
      .maybeSingle();

    const payload: any = {
      user_id: data.userId,
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.planId !== undefined ? { plan_id: data.planId } : {}),
      ...(data.priceCents !== undefined ? { price_cents: data.priceCents } : {}),
      ...(data.currentPeriodEnd !== undefined ? { current_period_end: data.currentPeriodEnd } : {}),
      ...(data.paymentMethod !== undefined ? { payment_method: data.paymentMethod } : {}),
      ...(data.status === "cancelada" ? { cancelled_at: new Date().toISOString() } : {}),
    };

    if (existing) {
      const { error } = await supabaseAdmin.from("app_subscriptions").update(payload).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from("app_subscriptions").insert(payload);
      if (error) throw error;
    }
    return { ok: true };
  });

export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_subscriptions")
      .update({ status: "cancelada", cancelled_at: new Date().toISOString() })
      .eq("user_id", data.userId);
    if (error) throw error;
    return { ok: true };
  });

export const markAsPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    userId: string;
    amountCents: number;
    method?: string | null;
    notes?: string | null;
    extendDays?: number;
  }) =>
    z
      .object({
        userId: z.string().uuid(),
        amountCents: z.number().int().nonnegative(),
        method: z.enum(["pix", "cartao", "boleto", "dinheiro", "manual", "outro"]).nullable().optional(),
        notes: z.string().nullable().optional(),
        extendDays: z.number().int().min(0).max(3650).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sub, error: sErr } = await supabaseAdmin
      .from("app_subscriptions")
      .select("*, app_plans(duration_days)")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!sub) throw new Error("Assinatura não encontrada. Defina um plano primeiro.");

    const { error: payErr } = await supabaseAdmin.from("app_subscription_payments").insert({
      subscription_id: sub.id,
      user_id: data.userId,
      amount_cents: data.amountCents,
      method: data.method ?? sub.payment_method ?? "manual",
      notes: data.notes ?? null,
    });
    if (payErr) throw payErr;

    const days = data.extendDays ?? (sub as any).app_plans?.duration_days ?? 30;
    const base = sub.current_period_end && new Date(sub.current_period_end) > new Date()
      ? new Date(sub.current_period_end)
      : new Date();
    base.setDate(base.getDate() + days);

    const { error: upErr } = await supabaseAdmin
      .from("app_subscriptions")
      .update({
        status: "ativa",
        current_period_end: base.toISOString(),
        cancelled_at: null,
      })
      .eq("id", sub.id);
    if (upErr) throw upErr;
    return { ok: true };
  });

export const renewSubscriberDays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; days: number }) =>
    z.object({ userId: z.string().uuid(), days: z.number().int().min(1).max(3650) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: s } = await supabaseAdmin
      .from("settings")
      .select("subscription_expires_at")
      .eq("user_id", data.userId)
      .maybeSingle();
    const current = s?.subscription_expires_at;
    const base = current && new Date(current) > new Date() ? new Date(current) : new Date();
    base.setDate(base.getDate() + data.days);
    const newExpiry = base.toISOString().slice(0, 10);
    const { error } = await supabaseAdmin
      .from("settings")
      .upsert({ user_id: data.userId, subscription_expires_at: newExpiry }, { onConflict: "user_id" });
    if (error) throw error;
    return { ok: true, expires_at: newExpiry };
  });

export const deleteSubscriber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Você não pode excluir sua própria conta.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw error;
    return { ok: true };
  });

export const promoteToReseller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.userId, role: "revendedor" as any }, { onConflict: "user_id,role" });
    if (error) throw error;
    return { ok: true };
  });
export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) return { isAdmin: false };
    return { isAdmin: !!data };
  });
