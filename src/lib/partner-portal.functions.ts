import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getCycleForDate } from "./partner-closings";

/**
 * Área Exclusiva do Indicador (Portal do Parceiro)
 * Controle rigoroso de isolamento: parceiro só acessa os dados vinculados a seu auth_user_id ou email.
 */

export const getPartnerMeFn = createServerFn({ method: "POST" })
  .inputValidator((data: { email?: string; authUserId?: string }) => data)
  .handler(async ({ data }) => {
    let q = supabaseAdmin.from("partners").select("*");
    if (data.authUserId) {
      q = q.eq("auth_user_id", data.authUserId);
    } else if (data.email) {
      q = q.eq("email", data.email.trim().toLowerCase());
    } else {
      throw new Error("Identificação necessária");
    }

    const { data: partner, error } = await q.maybeSingle();
    if (error || !partner) throw new Error("Parceiro não encontrado");
    return partner;
  });

export const getPartnerDashboardStatsFn = createServerFn({ method: "POST" })
  .inputValidator((data: { partnerId: string }) => data)
  .handler(async ({ data }) => {
    const { partnerId } = data;
    if (!partnerId) throw new Error("ID obrigatório");

    const [partnerRes, clientsRes, commissionsRes, closingsRes] = await Promise.all([
      supabaseAdmin.from("partners").select("*").eq("id", partnerId).single(),
      supabaseAdmin.from("clients").select("id, name, phone, due_date, status, created_at").eq("partner_id", partnerId),
      supabaseAdmin.from("partner_commissions").select("id, amount_cents, status, created_at").eq("partner_id", partnerId),
      supabaseAdmin.from("partner_weekly_closings").select("*").eq("partner_id", partnerId).order("payment_due_date", { ascending: false }),
    ]);

    const partner = partnerRes.data;
    const clients = clientsRes.data ?? [];
    const commissions = commissionsRes.data ?? [];
    const closings = closingsRes.data ?? [];

    const activeClients = clients.filter((c: any) => c.status === "ativo").length;
    const totalCommissionsCount = commissions.length;
    const currentCycle = getCycleForDate(new Date());

    return {
      partner,
      totalClients: clients.length,
      activeClients,
      balanceCents: partner?.balance_cents || 0,
      totalEarnedCents: partner?.total_earned_cents || 0,
      totalWithdrawnCents: partner?.total_withdrawn_cents || 0,
      totalCommissionsCount,
      nextPaymentDueDate: currentCycle.paymentDueDate,
      currentCycleLabel: currentCycle.label,
      clients,
      commissions,
      closings,
    };
  });

export const updatePartnerPixFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { partnerId: string; pixKey: string; pixKeyType: string }) => data
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("partners")
      .update({
        pix_key: data.pixKey.trim(),
        pix_key_type: data.pixKeyType,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.partnerId);

    if (error) throw new Error(error.message);
    return { success: true };
  });

export const getPartnerRankingPositionFn = createServerFn({ method: "POST" })
  .inputValidator((data: { partnerId: string }) => data)
  .handler(async ({ data }) => {
    const { data: allPartners } = await supabaseAdmin
      .from("partners")
      .select("id, total_earned_cents")
      .order("total_earned_cents", { ascending: false });

    const total = allPartners?.length || 1;
    const position = (allPartners || []).findIndex((p: any) => p.id === data.partnerId) + 1;

    return {
      position: position > 0 ? position : total,
      totalPartners: total,
    };
  });
