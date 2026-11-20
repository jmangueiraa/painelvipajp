import { expect, test, mock } from "bun:test";
import { serverClientRequest, serverClientEnabled, serverAccessMessage } from "../src/lib/server-client-actions";

const identity = { service_type: "iptv" as const, client_id: "12/34" };
test("renewal reads service plans and posts only plan_id to extend", () => {
  expect(serverClientRequest({ ...identity, operation: "plans" })).toEqual({ endpoint: "/iptv/plans", method: "GET" });
  expect(serverClientRequest({ ...identity, operation: "extend", plan_id: 7 })).toEqual({ endpoint: "/iptv/clients/12%2F34/extend", method: "POST", body: { plan_id: 7 } });
});
test("access data is obtained from the client message endpoint", () => {
  expect(serverClientRequest({ ...identity, service_type: "p2p", operation: "message" })).toEqual({ endpoint: "/p2p/clients/12%2F34/message", method: "GET" });
  expect(serverAccessMessage({ data: { message: "https://server.example/list.m3u" } })).toBe("https://server.example/list.m3u");
});
test("changing plan uses PUT with plan_id", () => {
  expect(serverClientRequest({ ...identity, operation: "plan", plan_id: "9" })).toEqual({ endpoint: "/iptv/clients/12%2F34", method: "PUT", body: { plan_id: "9" } });
  expect(() => serverClientRequest({ ...identity, operation: "plan" })).toThrow("Escolha um plano");
});
test("notes use PATCH and can be cleared", () => {
  expect(serverClientRequest({ ...identity, operation: "notes", notes: "" })).toEqual({ endpoint: "/iptv/clients/12%2F34/notes", method: "PATCH", body: { notes: "" } });
});
test("enable and disable use PATCH independently of expiry", () => {
  expect(serverClientRequest({ ...identity, operation: "status", enabled: false })).toEqual({ endpoint: "/iptv/clients/12%2F34/status", method: "PATCH", body: { status: "disabled" } });
  expect(serverClientRequest({ ...identity, operation: "status", enabled: true }).body).toEqual({ status: "active" });
  expect(serverClientEnabled({ raw: { status: "expired" } })).toBe(true);
  expect(serverClientEnabled({ raw: { enabled: false } })).toBe(false);
  expect(serverClientEnabled({ raw: { status: "disabled" } })).toBe(false);
});
test("trash deletes the client in the correct service", () => {
  expect(serverClientRequest({ ...identity, service_type: "p2p", operation: "delete" })).toEqual({ endpoint: "/p2p/clients/12%2F34", method: "DELETE" });
});
test("arbitrary services cannot select other API paths", () => {
  expect(() => serverClientRequest({ ...identity, service_type: "../me" as "iptv", operation: "delete" })).toThrow();
});

const calls: { endpoint: string; options: unknown }[] = [];
let response: unknown = { success: true };
mock.module("../src/lib/iptv-server-api.server", () => ({ callIptvServerApi: async (endpoint: string, options: unknown) => {
  calls.push({ endpoint, options }); return response;
} }));
test("server adapter scopes every call to the verified owner and returns safe results", async () => {
  const { runServerClientAction } = await import("../src/lib/server-client-actions.server");
  expect(await runServerClientAction("owner-test", { ...identity, operation: "extend", plan_id: 7 })).toEqual({ ok: true });
  expect(calls.at(-1)?.options).toMatchObject({ userId: "owner-test", method: "POST", body: { plan_id: 7 } });
  response = { data: [{ id: 7, name: "Mensal" }], api_key: "not-returned" };
  const plans = await runServerClientAction("owner-test", { ...identity, operation: "plans" });
  expect("plans" in plans && plans.plans?.[0]?.id).toBe(7);
  expect(plans).not.toHaveProperty("api_key");
  response = { success: false };
  await expect(runServerClientAction("owner-test", { ...identity, operation: "delete" })).rejects.toThrow();
});