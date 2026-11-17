import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/auto-charges")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.AUTO_CHARGES_SECRET;
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { buildChargeMessage, normalizeBrPhone } = await import(
          "@/lib/zapi.server"
        );

        const { sendWhatsAppText } = await import("@/lib/whatsapp-delivery.server");
        const today = new Date().toISOString().slice(0, 10);
        const { data: rows, error } = await supabaseAdmin
          .from("clients")
          .select("id,user_id,name,phone,iptv_login,iptv_password,due_date,auto_charge")
          .eq("auto_charge", true)
          .lte("due_date", today);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        let sent = 0;
        let failed = 0;
        for (const c of rows ?? []) {
          const phone = normalizeBrPhone(c.phone || "");
          if (!phone) {
            failed++;
            continue;
          }
          try {
            const r = await sendWhatsAppText({
              userId: c.user_id,
              phone,
              message: buildChargeMessage({
                identifier: c.name,
                login: c.iptv_login,
                password: (c as any).iptv_password,
                dueDateISO: c.due_date,
              }),
            });
            if (r.ok) sent++;
            else failed++;
          } catch {
            failed++;
          }
        }

        return new Response(
          JSON.stringify({ ok: true, total: rows?.length ?? 0, sent, failed, at: today }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
