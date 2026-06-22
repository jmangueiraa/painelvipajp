import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FilterSchema = z.object({
  filter: z.enum(["due_today", "due_tomorrow", "advance_5d", "overdue", "auto_due_or_overdue"]),
});

function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

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
