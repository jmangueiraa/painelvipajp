import { test, expect, mock } from "bun:test";

let claimed = false;
let deliveries = 0;
let notifications = 0;
const renewal = { id: "renewal-test", user_id: "owner-test", client_id: null, buyer_id: null, days: 0, amount_cents: 3000, status: "pending", label: "Produto" };
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from() {
    let updating = false;
    const query = {
      select() { return query; }, eq() { return query; }, neq() { return query; },
      update() { updating = true; return query; },
      async maybeSingle() {
        if (!updating) return { data: renewal };
        if (claimed) return { data: null };
        claimed = true; return { data: { id: renewal.id } };
      },
    };
    return query;
  },
} }));
mock.module("../src/lib/notifications.server", () => ({ notify: async () => { notifications++; } }));
mock.module("../src/lib/payment-whatsapp.server", () => ({ invokePaymentWhatsApp: async (id: string) => {
  expect(id).toBe("renewal-test"); deliveries++; return "accepted";
} }));

test("only approved payment claim calls WhatsApp alongside Telegram once", async () => {
  const { finalizePaidRenewal } = await import("../src/lib/portal-renewal-finalize.server");
  const pending = await finalizePaidRenewal(renewal.id, { status: "pending" });
  expect(pending.claimed).toBe(false); expect(deliveries).toBe(0); expect(notifications).toBe(0);
  const first = await finalizePaidRenewal(renewal.id, { status: "approved" });
  expect(first.whatsapp).toBe("accepted"); expect(deliveries).toBe(1); expect(notifications).toBe(2);
  const repeat = await finalizePaidRenewal(renewal.id, { status: "approved" });
  expect(repeat.claimed).toBe(false); expect(deliveries).toBe(1); expect(notifications).toBe(2);
});