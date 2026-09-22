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
      const yyyy = due.getFullYear();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
      const identifier = c.iptv_login || c.name;
      const credLines: string[] = [];
      if (c.iptv_login) credLines.push(`👤 Usuário: ${c.iptv_login}`);
      if (c.iptv_password) credLines.push(`🔑 Senha: ${c.iptv_password}`);
      const credBlock = credLines.length ? `\n\n${credLines.join("\n")}\n` : "\n";

      let header: string;
      let statusLine: string;
      if (diffDays > 0) {
        header = `⏰ Faltam ${diffDays} ${diffDays === 1 ? "dia" : "dias"} para o vencimento do seu acesso ${identifier}!`;
        statusLine = `Olá! Seu acesso ${identifier} vence em ${dd}/${mm}/${yyyy} (faltam ${diffDays} ${diffDays === 1 ? "dia" : "dias"}).`;
      } else if (diffDays === 0) {
        header = `⚠️ Seu acesso ${identifier} vence HOJE!`;
        statusLine = `Olá! Seu acesso ${identifier} vence hoje (${dd}/${mm}/${yyyy}).`;
      } else {
        const overdue = Math.abs(diffDays);
        header = `🚨 Seu acesso ${identifier} expirou!`;
        statusLine = `Olá! Seu acesso ${identifier} venceu em ${dd}/${mm}/${yyyy} (${overdue} ${overdue === 1 ? "dia" : "dias"} em atraso).`;
      }

      return `${header}\n\n${statusLine}\n\nPara continuar aproveitando o serviço sem interrupções, renove agora mesmo pelo nosso portal:\n\n🌐 https://portalajp.com.br/portal\n${credBlock}\nA renovação é rápida e, após a confirmação do pagamento, a liberação do acesso é feita automaticamente.\n\nAgradecemos pela preferência e esperamos você de volta! 😊`;
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
      .select("id,name,phone,iptv_login,due_date,auto_charge,status");

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
            identifier: c.iptv_login || c.name,
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
