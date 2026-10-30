import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
const adminDb = supabaseAdmin as any;
import {
  getAdminIndicaStats,
  generateWeeklyClosingsForPeriod,
  markWeeklyClosingAsPaid,
} from "./ajp-indica.server";
import type { Partner, PartnerCommission, PartnerWeeklyClosing, PartnerWalletTransaction } from "./ajp-indica.types";

/**
 * 1. Estatísticas Gerais do AJP INDICA
 */
export const getIndicaOverviewStatsFn = createServerFn({ method: "GET" }).handler(async () => {
  return await getAdminIndicaStats();
});

/**
 * 2. Indicadores (Listagem, Cadastro, Edição)
 */
export const listPartnersFn = createServerFn({ method: "GET" })
  .inputValidator((data?: { search?: string; status?: string }) => data ?? {})
  .handler(async ({ data }): Promise<Partner[]> => {
    let q = (adminDb.from("partners") as any).select("*").order("created_at", { ascending: false });
    if (data?.status && data.status !== "todos") {
      q = q.eq("status", data.status);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let list = (rows as Partner[]) ?? [];
    if (data?.search) {
      const s = data.search.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(s) ||
          p.code.toLowerCase().includes(s) ||
          p.email.toLowerCase().includes(s) ||
          p.phone.includes(s)
      );
    }
    return list;
  });

export const savePartnerFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      id?: string;
      name: string;
      email: string;
      phone: string;
      code: string;
      pix_key?: string | null;
      pix_key_type?: string | null;
      status?: "ativo" | "inativo" | "bloqueado";
      notes?: string | null;
    }) => data
  )
  .handler(async ({ data }) => {
    const code = data.code.trim().toUpperCase();
    if (!code) throw new Error("Código é obrigatório");
    if (!data.name.trim()) throw new Error("Nome é obrigatório");
    if (!data.email.trim()) throw new Error("E-mail é obrigatório");

    // Verifica se o código já existe em outro parceiro
    let checkQ = (adminDb.from("partners") as any).select("id").eq("code", code);
    if (data.id) checkQ = checkQ.neq("id", data.id);
    const { data: existing } = await checkQ.maybeSingle();
    if (existing) throw new Error(`O código ${code} já está em uso por outro parceiro.`);

    const payload = {
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      phone: data.phone.trim(),
      code,
      pix_key: data.pix_key?.trim() || null,
      pix_key_type: data.pix_key_type || "cpf",
      status: data.status || "ativo",
      notes: data.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { error } = await (adminDb.from("partners") as any).update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { success: true, id: data.id };
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("partners")
        .insert({
          ...payload,
          balance_cents: 0,
          total_earned_cents: 0,
          total_withdrawn_cents: 0,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { success: true, id: created.id };
    }
  });

export const deletePartnerFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { error } = await (adminDb.from("partners") as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });

/**
 * 3. Comissões
 */
export const listCommissionsFn = createServerFn({ method: "GET" })
  .inputValidator((data?: { partnerId?: string; status?: string }) => data ?? {})
  .handler(async ({ data }): Promise<PartnerCommission[]> => {
    let q = supabaseAdmin
      .from("partner_commissions")
      .select("*, partner:partner_id(name, code, pix_key, pix_key_type), client:client_id(name, phone, due_date, status)")
      .order("created_at", { ascending: false });

    if (data?.partnerId) q = q.eq("partner_id", data.partnerId);
    if (data?.status && data.status !== "todos") q = q.eq("status", data.status);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows as any) ?? [];
  });

/**
 * 4. Clientes Indicados
 */
export const listReferredClientsFn = createServerFn({ method: "GET" })
  .inputValidator((data?: { partnerId?: string }) => data ?? {})
  .handler(async ({ data }) => {
    let q = supabaseAdmin
      .from("clients")
      .select("id, name, phone, due_date, status, price_cents, created_at, partner_id, partner_code, partner:partner_id(name, code)")
      .not("partner_id", "is", null)
      .order("created_at", { ascending: false });

    if (data?.partnerId) q = q.eq("partner_id", data.partnerId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows as any[]) ?? [];
  });

/**
 * 5. Fechamentos Semanais
 */
export const listWeeklyClosingsFn = createServerFn({ method: "GET" })
  .inputValidator((data?: { status?: string }) => data ?? {})
  .handler(async ({ data }): Promise<PartnerWeeklyClosing[]> => {
    let q = supabaseAdmin
      .from("partner_weekly_closings")
      .select("*, partner:partner_id(name, code, email, phone)")
      .order("payment_due_date", { ascending: false });

    if (data?.status && data.status !== "todos") q = q.eq("status", data.status);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows as any) ?? [];
  });

export const generateWeeklyClosingsFn = createServerFn({ method: "POST" })
  .inputValidator((data: { year: number; month: number; cycleNumber: number }) => data)
  .handler(async ({ data }) => {
    return await generateWeeklyClosingsForPeriod(data);
  });

export const markClosingPaidFn = createServerFn({ method: "POST" })
  .inputValidator((data: { closingId: string; pixTransactionId?: string }) => data)
  .handler(async ({ data }) => {
    const success = await markWeeklyClosingAsPaid(data);
    return { success };
  });

/**
 * 6. Carteiras e Extratos
 */
export const listPartnerWalletTransactionsFn = createServerFn({ method: "GET" })
  .inputValidator((data?: { partnerId?: string }) => data ?? {})
  .handler(async ({ data }): Promise<PartnerWalletTransaction[]> => {
    let q = supabaseAdmin
      .from("partner_wallet_transactions")
      .select("*")
      .order("created_at", { ascending: false });

    if (data?.partnerId) q = q.eq("partner_id", data.partnerId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows as PartnerWalletTransaction[]) ?? [];
  });

/**
 * 7. Ranking dos Parceiros
 */
export const getPartnerRankingFn = createServerFn({ method: "GET" }).handler(async () => {
  const { data: partners, error } = await supabaseAdmin
    .from("partners")
    .select("id, name, code, total_earned_cents, balance_cents, status")
    .order("total_earned_cents", { ascending: false });

  if (error) throw new Error(error.message);

  // Conta clientes ativos por parceiro
  const { data: clients } = await supabaseAdmin
    .from("clients")
    .select("partner_id, status")
    .not("partner_id", "is", null);

  const activeClientsMap = new Map<string, number>();
  const totalClientsMap = new Map<string, number>();

  for (const c of clients ?? []) {
    const pId = (c as any).partner_id;
    totalClientsMap.set(pId, (totalClientsMap.get(pId) || 0) + 1);
    if ((c as any).status === "ativo") {
      activeClientsMap.set(pId, (activeClientsMap.get(pId) || 0) + 1);
    }
  }

  return (partners ?? []).map((p: any, idx: number) => ({
    rank: idx + 1,
    id: p.id,
    name: p.name,
    code: p.code,
    totalEarnedCents: p.total_earned_cents || 0,
    balanceCents: p.balance_cents || 0,
    status: p.status,
    totalClients: totalClientsMap.get(p.id) || 0,
    activeClients: activeClientsMap.get(p.id) || 0,
  }));
});

/**
 * 8. Configurações AJP INDICA
 */
export const getIndicaSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await adminDb.from("partner_settings").select("*").limit(1).maybeSingle();
  return (
    data ?? {
      commission_cents: 2000,
      is_enabled: true,
      auto_approve: true,
      terms_text: "Comissão de R$ 20,00 na 1ª assinatura confirmada de cada novo cliente indicado.",
    }
  );
});

export const updateIndicaSettingsFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      commission_cents: number;
      is_enabled: boolean;
      auto_approve: boolean;
      terms_text?: string | null;
    }) => data
  )
  .handler(async ({ data }) => {
    const { data: existing } = await adminDb.from("partner_settings").select("id").limit(1).maybeSingle();
    if (existing) {
      await adminDb.from("partner_settings").update(data).eq("id", existing.id);
    } else {
      // Pega qualquer user_id admin
      const { data: s } = await adminDb.from("settings").select("user_id").limit(1).maybeSingle();
      const userId = s?.user_id || "00000000-0000-0000-0000-000000000000";
      await adminDb.from("partner_settings").insert({ ...data, user_id: userId });
    }
    return { success: true };
  });

/**
 * 9. Indicações / Log de Cliques
 */
export const listPartnerClicksFn = createServerFn({ method: "GET" }).handler(async () => {
  const { data: rows, error } = await supabaseAdmin
    .from("partner_clicks")
    .select("*, partner:partner_id(name, code)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);
  return (rows as any[]) ?? [];
});
