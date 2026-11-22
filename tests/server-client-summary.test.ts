import { describe, expect, test } from "bun:test";
import { dueThisMonth, normalizeServerClients } from "../src/lib/server-client-summary";

describe("RBOYS overview data", () => {
  test("missing or failed responses have safe empty metrics", () => {
    for (const response of [null, undefined, { ok: false, clients: null }, { clients: [null] }]) {
      const result = normalizeServerClients(response);
      expect(result.clients).toEqual([]);
      expect(result.kpis).toEqual({ total: 0, ativos: 0, desativados: 0, vencidos: 0, vencem_hoje: 0 });
    }
  });
  test("uses provider counts instead of local portal counts", () => {
    const result = normalizeServerClients({ ok: true, kpis: { total: 175, ativos: "125", desativados: 1, vencidos: 2, vencem_hoje: 25 } });
    expect(result.kpis).toEqual({ total: 175, ativos: 125, desativados: 1, vencidos: 2, vencem_hoje: 25 });
  });
  test("nonfinite counts are replaced rather than rendered", () => {
    expect(normalizeServerClients({ kpis: { total: "bad", ativos: Infinity } }).kpis.total).toBe(0);
    expect(normalizeServerClients({ kpis: { ativos: Infinity } }).kpis.ativos).toBe(0);
  });
  test("monthly filter excludes today, past dates and next month", () => {
    const client = normalizeServerClients({ clients: [{ username: "test", due_date_str: "2026-11-21" }] }).clients[0];
    if (!client) throw new Error("Missing client");
    expect(dueThisMonth(client, "2026-11-20")).toBe(true);
    expect(dueThisMonth({ ...client, due_date_str: "2026-11-20" }, "2026-11-20")).toBe(false);
    expect(dueThisMonth({ ...client, due_date_str: "2026-12-01" }, "2026-11-20")).toBe(false);
    expect(dueThisMonth({ ...client, due_date_str: null }, "2026-11-20")).toBe(false);
  });
});