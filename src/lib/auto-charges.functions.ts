import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FilterSchema = z.object({
  filter: z.enum(["due_today", "due_tomorrow", "advance_5d", "overdue", "auto_due_or_overdue"]),
});

const IdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const sendChargesToIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => IdsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("clients")
      .select("id,name,phone,iptv_login,iptv_password,due_date,status")
      .in("id", data.ids);
    if (error) throw new Error(error.message);

    const { sendZapiText, normalizeBrPhone } = await import("./zapi.server");

    const buildMsg = (c: {
      name: string;
      iptv_login: string | null;
      iptv_password: string | null;
      due_date: string;
    }) => {
      const due = new Date(c.due_date + "T00:00:00");
      const dd = String(due.getDate()).padStart(2, "0");
      const mm = String(due.getMonth() + 1).padStart(2, "0");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
      const identifier = c.iptv_login || c.name;

      let header: string;
      let actionLine: string;
      if (diffDays > 0) {
        header = `⚠️ Aviso de Vencimento: *Faltam ${diffDays} ${diffDays === 1 ? "dia" : "dias"}!*`;
        actionLine = `Olá! Seu acesso *(${identifier})* expira em *${dd}/${mm}*. Renove agora para evitar a interrupção do serviço.`;
      } else if (diffDays === 0) {
        header = `⚠️ Aviso de Vencimento: *Vence HOJE!*`;
        actionLine = `Olá! Seu acesso *(${identifier})* expira *HOJE (${dd}/${mm})*. Renove agora para evitar a interrupção do serviço.`;
      } else {
        const overdue = Math.abs(diffDays);
        header = `⚠️ Aviso de Vencimento: *Vencido há ${overdue} ${overdue === 1 ? "dia" : "dias"}!*`;
        actionLine = `Olá! Seu acesso *(${identifier})* expirou em *${dd}/${mm}*. Renove agora para evitar a interrupção do serviço.`;
      }

      const userVal = c.iptv_login || c.name;
      const credLines: string[] = [];
      if (userVal) credLines.push(`👤 *Usuário:* ${userVal}`);
      if (c.iptv_password) credLines.push(`🔑 *Senha:* ${c.iptv_password}`);
      const credBlock = credLines.length ? `\n\n${credLines.join("\n")}` : "";

      return `${header}\n\n\n${actionLine}\n\n\n*Acesse o portal:*\n🌐 https://portalajp.com.br/portal${credBlock}\n\n*Pagou, liberou!* A reativação é automática logo após a confirmação. Obrigado pela preferência! 😊`;
    };


    let sent = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const c of rows ?? []) {
      const phone = normalizeBrPhone(c.phone || "");
      if (!phone) {
        failed++;
        errors.push(`${c.name}: telefone inválido`);
        continue;
      }
      try {
        const r = await sendZapiText({ phone, message: buildMsg(c) });
        if (r.ok) sent++;
        else {
          failed++;
          errors.push(`${c.name}: HTTP ${r.status}`);
        }
      } catch (e) {
        failed++;
        errors.push(`${c.name}: ${(e as Error).message}`);
      }
    }
    return { total: rows?.length ?? 0, sent, failed, errors: errors.slice(0, 10) };
  });

export const sendChargesNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => FilterSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const today = new Date().toISOString().slice(0, 10);

    let query = supabase
      .from("clients")
      .select("id,name,phone,iptv_login,iptv_password,due_date,auto_charge,status");

    if (data.filter === "due_today") query = query.eq("due_date", today);
    else if (data.filter === "due_tomorrow") query = query.eq("due_date", addDaysISO(today, 1));
    else if (data.filter === "advance_5d") query = query.eq("due_date", addDaysISO(today, 5));
    else if (data.filter === "overdue") query = query.lt("due_date", today);
    else if (data.filter === "auto_due_or_overdue") {
      query = query.eq("auto_charge", true).lte("due_date", today);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const { sendZapiText, buildChargeMessage, normalizeBrPhone } = await import("./zapi.server");

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const c of rows ?? []) {
      const phone = normalizeBrPhone(c.phone || "");
      if (!phone) {
        failed++;
        errors.push(`${c.name}: telefone inválido`);
        continue;
      }
      try {
        const r = await sendZapiText({
          phone,
          message: buildChargeMessage({
            identifier: c.name,
            login: c.iptv_login,
            password: (c as any).iptv_password,
            dueDateISO: c.due_date,
          }),
        });
        if (r.ok) sent++;
        else {
          failed++;
          errors.push(`${c.name}: HTTP ${r.status}`);
        }
      } catch (e) {
        failed++;
        errors.push(`${c.name}: ${(e as Error).message}`);
      }
    }

    return { total: rows?.length ?? 0, sent, failed, errors: errors.slice(0, 10) };
  });
