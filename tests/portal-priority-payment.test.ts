import { describe, expect, test } from "bun:test";
import { canShowPriorityPayment } from "../src/lib/portal-priority-payment";

const ready = {
  session: { client: { id: "client-1", due_date: "2026-11-22", price_cents: 3000, status: "ativo" } },
  token: "client-session", sessionConfirmed: true, isLoading: false, invoicesLoading: false, today: "2026-11-22",
};

describe("payment priority visibility", () => {
  test("never shows while session or pending invoice data loads", () => {
    expect(canShowPriorityPayment({ ...ready, isLoading: true })).toBe(false);
    expect(canShowPriorityPayment({ ...ready, invoicesLoading: true })).toBe(false);
    expect(canShowPriorityPayment({ ...ready, sessionConfirmed: false })).toBe(false);
  });
  test("adm tokens never show even with cached client data", () => {
    expect(canShowPriorityPayment({ ...ready, token: "adm.session" })).toBe(false);
  });
  test("all administrator role signals suppress the payment alert", () => {
    for (const admin of [{ is_admin: true }, { isAdmin: true }, { role: "adm" }, { role: "admin" }]) {
      expect(canShowPriorityPayment({ ...ready, session: { ...ready.session, ...admin } })).toBe(false);
    }
  });
  test("a confirmed nonadministrator with a due invoice can see the alert", () => {
    expect(canShowPriorityPayment(ready)).toBe(true);
    expect(canShowPriorityPayment({ ...ready, session: { client: { ...ready.session.client, due_date: "2026-11-21" } } })).toBe(true);
  });
  test("no pending contract, future renewed period or invalid data means no alert", () => {
    expect(canShowPriorityPayment({ ...ready, session: undefined })).toBe(false);
    expect(canShowPriorityPayment({ ...ready, session: { client: { ...ready.session.client, due_date: "2026-12-22" } } })).toBe(false);
    expect(canShowPriorityPayment({ ...ready, session: { client: { ...ready.session.client, price_cents: 0 } } })).toBe(false);
    expect(canShowPriorityPayment({ ...ready, token: null })).toBe(false);
  });
});