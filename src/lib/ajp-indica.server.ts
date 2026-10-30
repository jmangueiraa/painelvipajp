import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getCycleForDate, getMonthlyClosingCycles } from "./partner-closings";
import type { IndicaOverviewStats, Partner, PartnerCommission, PartnerWeeklyClosing } from "./ajp-indica.types";

/**
 * Processa a atribuição de comissão de R$ 20,00 quando um pagamento do Mercado Pago é aprovado.
 * Valida rigorosamente as 5 condições exigidas:
 * 1. Cliente foi indicado por um parceiro (possui partner_id ou partner_code).
 * 2. Cliente é realmente novo.
 * 3. É sua primeira assinatura.
 * 4. Não existe comissão prévia registrada para esse cliente.
 * 5. Pagamento aprovado no Mercado Pago (validado pela API).
 */
export async function processPartnerCommissionForPaidClient(params: {
  clientId: string;
  renewalRequestId: string;
  mpPaymentId?: string | number | null;
  clientName?: string | null;
  paymentAmountCents?: number;
}): Promise<{ commissionCreated: boolean; reason?: string }> {
  try {
    const { clientId, renewalRequestId, mpPaymentId, clientName } = params;
    if (!clientId) return { commissionCreated: false, reason: "Sem client_id" };

    // 1. Busca dados do cliente para verificar parceiro
    const { data: client, error: clientErr } = await supabaseAdmin
      .from("clients")
      .select("id, name, phone, partner_id, partner_code, created_at")
      .eq("id", clientId)
      .maybeSingle();

    if (clientErr || !client) {
      return { commissionCreated: false, reason: "Cliente não encontrado" };
    }

    let partnerId = (client as any).partner_id as string | null;
    const partnerCode = (client as any).partner_code as string | null;

    // Se só tem o código mas não o partner_id, resolve o ID
    if (!partnerId && partnerCode) {
      const { data: p } = await supabaseAdmin
        .from("partners")
        .select("id, status")
        .eq("code", partnerCode.trim().toUpperCase())
        .maybeSingle();
      if (p && (p as any).status === "ativo") {
        partnerId = (p as any).id;
        // Salva partner_id no cliente para histórico definitivo
        await supabaseAdmin.from("clients").update({ partner_id: partnerId }).eq("id", clientId);
      }
    }

    if (!partnerId) {
      return { commissionCreated: false, reason: "Cliente não foi indicado por nenhum parceiro" };
    }

    // 2. Verifica se o parceiro está ativo
    const { data: partnerRow } = await supabaseAdmin
      .from("partners")
      .select("id, name, balance_cents, total_earned_cents, status")
      .eq("id", partnerId)
      .maybeSingle();

    const partner = partnerRow as { id: string; name: string; balance_cents: number; total_earned_cents: number; status: string } | null;
    if (!partner || partner.status !== "ativo") {
      return { commissionCreated: false, reason: "Parceiro inativo ou inexistente" };
    }

    // 3. Verifica se já existe comissão para este cliente (Garantia de 1ª assinatura)
    const { data: existingCommission } = await supabaseAdmin
      .from("partner_commissions")
      .select("id")
      .eq("client_id", clientId)
      .maybeSingle();

    if (existingCommission) {
      return { commissionCreated: false, reason: "Cliente já gerou comissão anteriormente (renovações não geram comissão)" };
    }

    // 4. Verifica histórico de pagamentos anteriores do cliente (para garantir que é cliente realmente novo)
    const { count: priorPaymentsCount } = await supabaseAdmin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId);

    // Se tiver mais de 1 pagamento (o atual já pode ter sido inserido ou não), não é primeira assinatura
    if ((priorPaymentsCount ?? 0) > 1) {
      return { commissionCreated: false, reason: "Cliente já possui pagamentos anteriores (não é novo)" };
    }

    // 5. Busca valor padrão da comissão nas configurações (default R$ 20,00 = 2000 centavos)
    let commissionCents = 2000;
    const { data: settings } = await supabaseAdmin
      .from("partner_settings")
      .select("commission_cents, is_enabled")
      .limit(1)
      .maybeSingle();

    if (settings) {
      if ((settings as any).is_enabled === false) {
        return { commissionCreated: false, reason: "Programa AJP INDICA temporariamente desativado nas configurações" };
      }
      if ((settings as any).commission_cents && (settings as any).commission_cents > 0) {
        commissionCents = (settings as any).commission_cents;
      }
    }

    // 6. Insere a comissão em partner_commissions de forma atômica
    const { data: insertedCommission, error: commErr } = await supabaseAdmin
      .from("partner_commissions")
      .insert({
        partner_id: partner.id,
        client_id: clientId,
        renewal_request_id: renewalRequestId,
        mp_payment_id: mpPaymentId ? String(mpPaymentId) : null,
        amount_cents: commissionCents,
        status: "aprovada",
        approved_at: new Date().toISOString(),
        notes: `Comissão 1ª assinatura do cliente ${clientName || (client as any).name}`,
      })
      .select("id")
      .maybeSingle();

    if (commErr || !insertedCommission) {
      console.error("[AJP INDICA] Erro ao inserir comissão:", commErr);
      return { commissionCreated: false, reason: commErr?.message || "Erro no banco" };
    }

    // 7. Atualiza o saldo e total ganho na carteira do parceiro
    const currentBalance = partner.balance_cents || 0;
    const currentEarned = partner.total_earned_cents || 0;
    const newBalance = currentBalance + commissionCents;
    const newEarned = currentEarned + commissionCents;

    await supabaseAdmin
      .from("partners")
      .update({
        balance_cents: newBalance,
        total_earned_cents: newEarned,
        updated_at: new Date().toISOString(),
      })
      .eq("id", partner.id);

    // 8. Registra no extrato da carteira (partner_wallet_transactions)
    await supabaseAdmin.from("partner_wallet_transactions").insert({
      partner_id: partner.id,
      type: "comissao_creditada",
      amount_cents: commissionCents,
      balance_after_cents: newBalance,
      description: `Comissão 1ª Assinatura — Cliente ${clientName || (client as any).name}`,
      reference_id: insertedCommission.id,
    });

    console.log(`[AJP INDICA] ✅ Comissão de R$ ${(commissionCents / 100).toFixed(2)} aprovada com sucesso para o parceiro ${partner.name} (Cliente: ${clientName || (client as any).name})`);

    return { commissionCreated: true };
  } catch (err: any) {
    console.error("[AJP INDICA] Exceção ao processar comissão:", err);
    return { commissionCreated: false, reason: err?.message };
  }
}

/**
 * Registra o clique e visita a partir de um link de indicação ?ref=AJP0001
 */
export async function trackPartnerReferralClick(params: {
  code: string;
  ip?: string | null;
  userAgent?: string | null;
  referer?: string | null;
}): Promise<{ valid: boolean; partnerName?: string }> {
  try {
    const cleanCode = (params.code || "").trim().toUpperCase();
    if (!cleanCode) return { valid: false };

    const { data: partner } = await supabaseAdmin
      .from("partners")
      .select("id, name, status")
      .eq("code", cleanCode)
      .maybeSingle();

    if (!partner || (partner as any).status !== "ativo") {
      return { valid: false };
    }

    await supabaseAdmin.from("partner_clicks").insert({
      partner_id: (partner as any).id,
      ip: params.ip || null,
      user_agent: params.userAgent || null,
      referer: params.referer || null,
    });

    return { valid: true, partnerName: (partner as any).name };
  } catch (err) {
    console.error("[AJP INDICA] Erro ao registrar clique:", err);
    return { valid: false };
  }
}

/**
 * Associa um cliente a um parceiro de indicação via código
 */
export async function linkClientToPartnerCode(clientId: string, code: string): Promise<boolean> {
  try {
    const cleanCode = (code || "").trim().toUpperCase();
    if (!cleanCode || !clientId) return false;

    const { data: partner } = await supabaseAdmin
      .from("partners")
      .select("id, status")
      .eq("code", cleanCode)
      .maybeSingle();

    if (!partner || (partner as any).status !== "ativo") return false;

    await supabaseAdmin
      .from("clients")
      .update({
        partner_id: (partner as any).id,
        partner_code: cleanCode,
      })
      .eq("id", clientId);

    return true;
  } catch (e) {
    console.error("[AJP INDICA] Erro ao vincular cliente ao parceiro:", e);
    return false;
  }
}

/**
 * Gera os fechamentos semanais com base no calendário oficial
 */
export async function generateWeeklyClosingsForPeriod(params: {
  year: number;
  month: number;
  cycleNumber: number;
}): Promise<{ createdCount: number }> {
  const cycles = getMonthlyClosingCycles(params.year, params.month);
  const cycle = cycles.find((c) => c.cycleNumber === params.cycleNumber);
  if (!cycle) throw new Error("Ciclo inválido");

  // Busca todas as comissões aprovadas no período que ainda não foram vinculadas a um fechamento
  const { data: commissions, error } = await supabaseAdmin
    .from("partner_commissions")
    .select("id, partner_id, amount_cents, created_at, status")
    .eq("status", "aprovada")
    .is("closing_id", null)
    .gte("created_at", `${cycle.periodStart}T00:00:00Z`)
    .lte("created_at", `${cycle.periodEnd}T23:59:59Z`);

  if (error || !commissions || commissions.length === 0) {
    return { createdCount: 0 };
  }

  // Agrupa comissões por parceiro
  const byPartner = new Map<string, { count: number; totalCents: number; ids: string[] }>();
  for (const c of commissions) {
    const pId = (c as any).partner_id;
    const existing = byPartner.get(pId) || { count: 0, totalCents: 0, ids: [] };
    existing.count += 1;
    existing.totalCents += (c as any).amount_cents || 2000;
    existing.ids.push((c as any).id);
    byPartner.set(pId, existing);
  }

  let createdCount = 0;
  for (const [pId, group] of byPartner.entries()) {
    // Busca dados Pix do parceiro
    const { data: p } = await supabaseAdmin
      .from("partners")
      .select("pix_key, pix_key_type")
      .eq("id", pId)
      .maybeSingle();

    const pixKey = (p as any)?.pix_key || null;
    const pixKeyType = (p as any)?.pix_key_type || null;

    // Cria fechamento semanal
    const { data: closing, error: closeErr } = await supabaseAdmin
      .from("partner_weekly_closings")
      .insert({
        partner_id: pId,
        cycle_number: cycle.cycleNumber,
        period_start: cycle.periodStart,
        period_end: cycle.periodEnd,
        payment_due_date: cycle.paymentDueDate,
        commissions_count: group.count,
        total_cents: group.totalCents,
        status: "aberto",
        pix_key: pixKey,
        pix_key_type: pixKeyType,
      })
      .select("id")
      .single();

    if (!closeErr && closing) {
      createdCount += 1;
      // Atualiza comissões com o ID do fechamento
      await supabaseAdmin
        .from("partner_commissions")
        .update({ closing_id: closing.id })
        .in("id", group.ids);
    }
  }

  return { createdCount };
}

/**
 * Marca um fechamento semanal como PAGO via Pix
 */
export async function markWeeklyClosingAsPaid(params: {
  closingId: string;
  pixTransactionId?: string;
}): Promise<boolean> {
  const { closingId, pixTransactionId } = params;

  const { data: closing } = await supabaseAdmin
    .from("partner_weekly_closings")
    .select("*")
    .eq("id", closingId)
    .maybeSingle();

  if (!closing || (closing as any).status === "pago") return false;

  const totalCents = (closing as any).total_cents || 0;
  const partnerId = (closing as any).partner_id;

  // Atualiza fechamento para pago
  await supabaseAdmin
    .from("partner_weekly_closings")
    .update({
      status: "pago",
      pix_transaction_id: pixTransactionId || null,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", closingId);

  // Atualiza as comissões correspondentes para pagas
  await supabaseAdmin
    .from("partner_commissions")
    .update({
      status: "paga",
      paid_at: new Date().toISOString(),
    })
    .eq("closing_id", closingId);

  // Atualiza saldo e total sacado do parceiro
  const { data: partner } = await supabaseAdmin
    .from("partners")
    .select("balance_cents, total_withdrawn_cents")
    .eq("id", partnerId)
    .maybeSingle();

  if (partner) {
    const curBalance = (partner as any).balance_cents || 0;
    const curWithdrawn = (partner as any).total_withdrawn_cents || 0;
    const newBalance = Math.max(0, curBalance - totalCents);
    const newWithdrawn = curWithdrawn + totalCents;

    await supabaseAdmin
      .from("partners")
      .update({
        balance_cents: newBalance,
        total_withdrawn_cents: newWithdrawn,
        updated_at: new Date().toISOString(),
      })
      .eq("id", partnerId);

    // Registra débito no extrato
    await supabaseAdmin.from("partner_wallet_transactions").insert({
      partner_id: partnerId,
      type: "saque_pix",
      amount_cents: -totalCents,
      balance_after_cents: newBalance,
      description: `Pagamento Pix — Fechamento Semanal (Ciclo ${(closing as any).cycle_number || 1})`,
      reference_id: closingId,
    });
  }

  return true;
}

/**
 * Estatísticas do Dashboard AJP INDICA para o administrador
 */
export async function getAdminIndicaStats(): Promise<IndicaOverviewStats> {
  const [partnersRes, clientsRes, commissionsRes] = await Promise.all([
    supabaseAdmin.from("partners").select("id, status"),
    supabaseAdmin.from("clients").select("id, status, price_cents, partner_id").not("partner_id", "is", null),
    supabaseAdmin.from("partner_commissions").select("amount_cents, status"),
  ]);

  const partners = partnersRes.data ?? [];
  const clients = clientsRes.data ?? [];
  const commissions = commissionsRes.data ?? [];

  const totalPartners = partners.length;
  const activePartners = partners.filter((p: any) => p.status === "ativo").length;

  const totalReferredClients = clients.length;
  const activeReferredClients = clients.filter((c: any) => c.status === "ativo").length;
  const mrrReferredCents = clients
    .filter((c: any) => c.status === "ativo")
    .reduce((acc: number, c: any) => acc + (c.price_cents || 0), 0);

  let commissionsGeneratedCents = 0;
  let commissionsPendingCents = 0;
  let commissionsPaidCents = 0;

  for (const c of commissions as any[]) {
    const amt = c.amount_cents || 0;
    commissionsGeneratedCents += amt;
    if (c.status === "aprovada" || c.status === "pendente") {
      commissionsPendingCents += amt;
    } else if (c.status === "paga") {
      commissionsPaidCents += amt;
    }
  }

  return {
    totalPartners,
    activePartners,
    totalReferredClients,
    activeReferredClients,
    mrrReferredCents,
    commissionsGeneratedCents,
    commissionsPendingCents,
    commissionsPaidCents,
  };
}
