// Server-only: finaliza uma renovação/compra do portal ao confirmar pagamento.
// Idempotente via transição atômica `.neq("status","paid")`.
// Usado pelo webhook do Mercado Pago e pelo polling `renewal-status`.

import { formatPhone } from "./format";

export interface FinalizeResult {
  ok: boolean;
  claimed: boolean;
  reason?: string;
  newDueDate?: string;
  clientName?: string;
  clientPhone?: string;
}

export interface ClientFallbackInfo {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  due_date?: string | null;
  user_id?: string | null;
}

export interface PaymentExtendedInfo {
  id?: string | number | null;
  status?: string | null;
  date_approved?: string | null;
  transaction_amount?: number | null;
  payment_method_id?: string | null;
  payment_type_id?: string | null;
  description?: string | null;
  payer?: {
    first_name?: string | null;
    last_name?: string | null;
    phone?: { area_code?: string; number?: string } | string | null;
    email?: string | null;
  } | null;
  metadata?: Record<string, unknown> | null;
}

export async function finalizePaidRenewal(
  renewalId: string,
  paymentInfo: PaymentExtendedInfo,
  clientFallback?: ClientFallbackInfo,
): Promise<FinalizeResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { notify } = await import("./notifications.server");

  const { data: renewalRaw } = await supabaseAdmin
    .from("renewal_requests")
    .select("*")
    .eq("id", renewalId)
    .maybeSingle();
  if (!renewalRaw) return { ok: true, claimed: false, reason: "not found" };

  const renewal = renewalRaw as {
    id: string;
    client_id: string | null;
    user_id: string;
    days: number;
    amount_cents: number | null;
    status: string;
    label: string | null;
    buyer_id: string | null;
  };

  const paidAtIso = paymentInfo.date_approved ?? new Date().toISOString();

  const { data: claimed } = await supabaseAdmin
    .from("renewal_requests")
    .update({
      mp_status: paymentInfo.status ?? "approved",
      mp_payment_id: paymentInfo.id ? String(paymentInfo.id) : undefined,
      paid_at: paidAtIso,
      status: "paid",
    })
    .eq("id", renewal.id)
    .neq("status", "paid")
    .select("id")
    .maybeSingle();

  if (!claimed) return { ok: true, claimed: false, reason: "already processed" };

  const amountCents =
    renewal.amount_cents ??
    (paymentInfo.transaction_amount ? Math.round(paymentInfo.transaction_amount * 100) : 0);

  const isCard =
    paymentInfo.payment_type_id === "credit_card" ||
    paymentInfo.payment_method_id === "credit_card" ||
    (paymentInfo.payment_method_id && !["pix", "bolbradesco"].includes(paymentInfo.payment_method_id));

  const notes = renewal.days > 0
    ? `Renovação ${renewal.days} dias - Mercado Pago${paymentInfo.id ? ` (id ${paymentInfo.id})` : ""}`
    : `${renewal.label ?? "Produto avulso"} - Mercado Pago${paymentInfo.id ? ` (id ${paymentInfo.id})` : ""}`;

  let resolvedName: string | null = clientFallback?.name ?? null;
  let resolvedPhone: string | null = clientFallback?.phone ?? null;
  let resolvedNewDue: string | null = null;

  // 1. Estende vencimento do cliente IPTV
  if (renewal.days > 0 && renewal.client_id) {
    let rpcDone = false;

    // Tentativa A: RPC SECURITY DEFINER (imune a RLS)
    try {
      const { data: rpcData, error: rpcErr } = await (supabaseAdmin.rpc as any)(
        "portal_finalize_client_renewal",
        {
          _client_id: renewal.client_id,
          _days: renewal.days,
          _user_id: renewal.user_id,
          _amount_cents: amountCents,
          _notes: notes,
        }
      );
      if (!rpcErr && rpcData && typeof rpcData === "object" && (rpcData as any).success) {
        rpcDone = true;
        resolvedName = (rpcData as any).name || resolvedName;
        resolvedPhone = (rpcData as any).phone || resolvedPhone;
        resolvedNewDue = (rpcData as any).new_due_date || null;
        console.log(`[finalizePaidRenewal] RPC portal_finalize_client_renewal successful: client ${renewal.client_id} -> ${resolvedNewDue}`);
      } else if (rpcErr) {
        console.warn("[finalizePaidRenewal] RPC not available or error:", rpcErr.message);
      }
    } catch (rpcEx) {
      console.warn("[finalizePaidRenewal] RPC exception:", rpcEx);
    }

    // Tentativa B: Fallback via consulta e atualização direta
    if (!rpcDone) {
      try {
        const { data: clientRow, error: clientFetchErr } = await supabaseAdmin
          .from("clients")
          .select("id, name, phone, due_date, status")
          .eq("id", renewal.client_id)
          .maybeSingle();

        if (clientFetchErr) {
          console.error("[finalizePaidRenewal] direct fetch client error:", clientFetchErr);
        }

        const cData = clientRow as { name?: string | null; phone?: string | null; due_date?: string | null; status?: string | null } | null;
        if (cData?.name) resolvedName = cData.name;
        if (cData?.phone) resolvedPhone = cData.phone;

        const current = cData?.due_date ?? clientFallback?.due_date ?? (paymentInfo.metadata?.current_due_date as string) ?? null;
        const days = Number(renewal.days || 30);
        const { calculateRenewalDueDate } = await import("./format");
        const { computeStatus } = await import("./status");

        const newDueDate = calculateRenewalDueDate(current, days);
        const newStatus = computeStatus(newDueDate, "ativo");
        resolvedNewDue = newDueDate;

        const { error: clientUpdateErr } = await supabaseAdmin
          .from("clients")
          .update({
            due_date: newDueDate,
            status: newStatus,
          })
          .eq("id", renewal.client_id);

        if (clientUpdateErr) {
          console.error("[finalizePaidRenewal] update client failed:", clientUpdateErr);
        } else {
          console.log(`[finalizePaidRenewal] Client ${renewal.client_id} successfully updated: ${current} -> ${newDueDate} (+${days} days)`);
        }

        // Histórico de pagamentos (apenas no fallback B, pois o RPC A já insere)
        const { error: payErr } = await supabaseAdmin.from("payments").insert({
          client_id: renewal.client_id,
          user_id: renewal.user_id,
          amount_cents: amountCents,
          paid_at: paidAtIso,
          method: isCard ? "cartao_mercadopago" : "pix_mercadopago",
          notes,
        });
        if (payErr) console.error("[finalizePaidRenewal] payments insert failed:", payErr);
      } catch (e) {
        console.error("[finalizePaidRenewal] error in fallback renewal:", e);
      }
    }
  }

  // Compras da loja por comprador externo
  if (renewal.buyer_id && renewal.days === 0 && renewal.label) {
    const { data: buyer } = await supabaseAdmin
      .from("store_buyers").select("name, email, phone").eq("id", renewal.buyer_id).maybeSingle();
    const b = (buyer as { name: string | null; email: string | null; phone: string | null } | null) ?? { name: null, email: null, phone: null };
    if (b.name) resolvedName = b.name;
    if (b.phone) resolvedPhone = b.phone;

    const { data: prod } = await supabaseAdmin
      .from("store_products")
      .select("id, cost_cents, duration_days")
      .eq("user_id", renewal.user_id)
      .eq("label", renewal.label)
      .maybeSingle();
    const p = prod as { id: string; cost_cents: number; duration_days: number } | null;
    const duration = p?.duration_days ?? 30;
    const dueDate = new Date();
    dueDate.setUTCDate(dueDate.getUTCDate() + duration);
    await supabaseAdmin.from("store_purchases").insert({
      user_id: renewal.user_id,
      client_id: null,
      buyer_id: renewal.buyer_id,
      buyer_name: b.name,
      buyer_email: b.email,
      product_id: p?.id ?? null,
      label: renewal.label,
      sale_cents: amountCents,
      cost_cents: p?.cost_cents ?? 0,
      duration_days: duration,
      purchased_at: paidAtIso,
      due_date: dueDate.toISOString().slice(0, 10),
      status: "active",
      renewal_request_id: renewal.id,
    });
  }

  // Extração resiliente de Nome e Telefone para garantir que NUNCA venham vazios
  if (!resolvedName) {
    resolvedName =
      (paymentInfo.metadata?.client_name as string) ||
      (paymentInfo.payer?.first_name
        ? `${paymentInfo.payer.first_name} ${paymentInfo.payer.last_name || ""}`.trim()
        : null) ||
      (paymentInfo.description?.includes(" - ")
        ? paymentInfo.description.split(" - ").pop()?.trim() ?? null
        : null) ||
      (renewal.label?.includes(" - ")
        ? renewal.label.split(" - ").pop()?.trim() ?? null
        : null) ||
      "Cliente";
  }

  if (!resolvedPhone) {
    const rawPayerPhone =
      typeof paymentInfo.payer?.phone === "string"
        ? paymentInfo.payer.phone
        : paymentInfo.payer?.phone?.number
          ? `${paymentInfo.payer.phone.area_code || ""}${paymentInfo.payer.phone.number}`
          : null;
    resolvedPhone =
      (paymentInfo.metadata?.client_phone as string) ||
      rawPayerPhone ||
      null;
  }

  const formattedPhone = resolvedPhone ? formatPhone(resolvedPhone) : null;

  // Notificações Telegram
  try {
    const metodo = isCard ? "Cartão Mercado Pago" : "PIX Mercado Pago";
    const payload = {
      nome: resolvedName,
      telefone: formattedPhone,
      email: null,
      plano: renewal.days > 0 ? `Renovação ${renewal.days} dias` : (renewal.label ?? "Produto avulso"),
      valor: (amountCents / 100).toFixed(2).replace(".", ","),
      metodo,
    };
    if (renewal.days > 0) {
      await notify("renewal", payload);
    } else {
      await notify("new_sale", payload);
    }
    await notify("payment_approved", payload);
  } catch (e) {
    console.error("[finalize] notify failed", e);
  }

  // Push FCM: pagamento confirmado
  if (renewal.client_id) {
    try {
      const { data: tokRows } = await supabaseAdmin.from("push_tokens").select("token").eq("client_id", renewal.client_id);
      const tokens = (tokRows || []).map((r: { token: string }) => r.token);
      if (tokens.length > 0) {
        const { sendPushToTokens } = await import("./fcm-send.server");
        await sendPushToTokens({
          tokens,
          title: "✅ Pagamento confirmado!",
          body: renewal.days > 0 ? `Seu acesso foi renovado por ${renewal.days} dias.` : "Seu pedido foi confirmado.",
          url: "/portal/painel",
        });
      }
    } catch (e) { console.error("[finalize] push failed", e); }
  }

  return {
    ok: true,
    claimed: true,
    newDueDate: resolvedNewDue ?? undefined,
    clientName: resolvedName ?? undefined,
    clientPhone: formattedPhone ?? undefined,
  };
}
