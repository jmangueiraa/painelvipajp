// Server-only: finaliza uma renovação/compra do portal ao confirmar pagamento.
// Idempotente via transição atômica `.neq("status","paid")`.
// Usado pelo webhook do Mercado Pago e pelo polling `renewal-status`.

export interface FinalizeResult {
  ok: boolean;
  claimed: boolean;
  reason?: string;
}

export async function finalizePaidRenewal(
  renewalId: string,
  paymentInfo: { id?: string | number | null; status?: string | null; date_approved?: string | null; transaction_amount?: number | null },
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

  // Estende vencimento do cliente IPTV
  if (renewal.days > 0 && renewal.client_id) {
    const { data: clientRow } = await supabaseAdmin
      .from("clients")
      .select("id, due_date")
      .eq("id", renewal.client_id)
      .maybeSingle();
    if (clientRow) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const current = (clientRow as { due_date: string | null }).due_date;
      const start = current && new Date(current + "T00:00:00Z").getTime() >= today.getTime()
        ? new Date(current + "T00:00:00Z")
        : today;
      const next = new Date(start);
      next.setUTCDate(next.getUTCDate() + Number(renewal.days || 0));
      const newDueDate = next.toISOString().slice(0, 10);
      await supabaseAdmin.from("clients").update({ due_date: newDueDate }).eq("id", renewal.client_id);
    }
  }

  const amountCents =
    renewal.amount_cents ??
    (paymentInfo.transaction_amount ? Math.round(paymentInfo.transaction_amount * 100) : 0);

  const notes = renewal.days > 0
    ? `Renovação ${renewal.days} dias - Mercado Pago${paymentInfo.id ? ` (id ${paymentInfo.id})` : ""}`
    : `${renewal.label ?? "Produto avulso"} - Mercado Pago${paymentInfo.id ? ` (id ${paymentInfo.id})` : ""}`;

  // Histórico de pagamentos (apenas para clientes IPTV)
  if (renewal.client_id) {
    const { error: payErr } = await supabaseAdmin.from("payments").insert({
      client_id: renewal.client_id,
      user_id: renewal.user_id,
      amount_cents: amountCents,
      paid_at: paidAtIso,
      method: "pix_mercadopago",
      notes,
    });
    if (payErr) console.error("[finalize] payments insert failed", payErr);
  }

  // Compras da loja por comprador externo
  if (renewal.buyer_id && renewal.days === 0 && renewal.label) {
    const { data: buyer } = await supabaseAdmin
      .from("store_buyers").select("name, email").eq("id", renewal.buyer_id).maybeSingle();
    const b = (buyer as { name: string | null; email: string | null } | null) ?? { name: null, email: null };
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

  // Notificações Telegram
  try {
    let nome: string | null = null;
    let telefone: string | null = null;
    let email: string | null = null;
    if (renewal.client_id) {
      const { data: c } = await supabaseAdmin.from("clients").select("name,phone").eq("id", renewal.client_id).maybeSingle();
      nome = (c as { name?: string | null } | null)?.name ?? null;
      telefone = (c as { phone?: string | null } | null)?.phone ?? null;
    } else if (renewal.buyer_id) {
      const { data: b } = await supabaseAdmin.from("store_buyers").select("name,email").eq("id", renewal.buyer_id).maybeSingle();
      nome = (b as { name?: string | null } | null)?.name ?? null;
      email = (b as { email?: string | null } | null)?.email ?? null;
    }
    const payload = {
      nome, telefone, email,
      plano: renewal.days > 0 ? `Renovação ${renewal.days} dias` : (renewal.label ?? "Produto avulso"),
      valor: (amountCents / 100).toFixed(2).replace(".", ","),
      metodo: "PIX Mercado Pago",
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

  return { ok: true, claimed: true };
}
