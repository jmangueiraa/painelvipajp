import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { handleSendWhatsApp, normalizeBrazilPhone } from "../../docs/send-whatsapp";

const id = "11111111-1111-4111-8111-111111111111";
const owner = "22222222-2222-4222-8222-222222222222";
const env = (name: string) => ({ SUPABASE_URL: "https://external.example.com", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test-only" })[name as "SUPABASE_URL"];
async function run(options: { key?: string; status?: string; mpStatus?: string; deliveryStatus?: number; buyer?: boolean; configured?: boolean } = {}) {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const response = await handleSendWhatsApp(new Request("https://external.example.com/functions/v1/send-whatsapp", {
    method: "POST", headers: { apikey: options.key ?? "sb_secret_test-only" }, body: JSON.stringify({ renewal_id: id, user_id: "ignored-other-owner", phone: "ignored" }),
  }), env, async (input, init) => {
    const url = new URL(String(input)); calls.push({ url, init });
    if (url.pathname === "/rest/v1/renewal_requests") return Response.json([{ id, user_id: owner, client_id: options.buyer ? null : "client-id", buyer_id: options.buyer ? "buyer-id" : null, status: options.status ?? "paid", mp_status: options.mpStatus ?? "approved", days: 30, amount_cents: 3000 }]);
    if (["/rest/v1/clients", "/rest/v1/store_buyers"].includes(url.pathname)) return Response.json([{ name: "Teste", phone: "(16) 99785-5438" }]);
    if (url.pathname === "/rest/v1/evolution_integrations") return Response.json(options.configured === false ? [] : [{ base_url: "https://evolution.example.com/", instance_name: "AJP VIP-test", api_key: "test-only-evolution" }]);
    return Response.json({ key: { id: "test-only-message" } }, { status: options.deliveryStatus ?? 200 });
  });
  return { response, calls, body: await response.json() };
}
describe("send-whatsapp external function", () => {
  test("phone gets 55 plus DDD and digits without duplicate 55", () => {
    for (const phone of ["(16) 99785-5438", "16997855438", "+55 (16) 99785-5438", "005516997855438"]) assert.equal(normalizeBrazilPhone(phone), "5516997855438");
    assert.throws(() => normalizeBrazilPhone("99785-5438"));
  });
  test("browser publishable credential cannot read secrets or send", async () => {
    const { response, calls } = await run({ key: "sb_publishable_test-only" });
    assert.equal(response.status, 401); assert.equal(calls.length, 0);
  });
  test("unpaid renewal cannot send", async () => {
    const { response, calls } = await run({ status: "pending" });
    assert.equal(response.status, 409); assert.equal(calls.length, 1);
  });
  test("pending Mercado Pago status cannot send even if locally paid", async () => {
    const { response, calls } = await run({ mpStatus: "pending" });
    assert.equal(response.status, 409); assert.equal(calls.length, 1);
  });
  test("approved payment uses only persisted owner's integration and formatted contact", async () => {
    const { response, calls, body } = await run();
    assert.equal(response.status, 200); assert.equal(body.whatsapp, "accepted");
    for (const table of ["clients", "evolution_integrations"]) {
      const call = calls.find(c => c.url.pathname === `/rest/v1/${table}`);
      assert.equal(call?.url.searchParams.get("user_id"), `eq.${owner}`);
      assert.equal(new Headers(call?.init?.headers).get("apikey"), "sb_secret_test-only");
    }
    const call = calls.find(c => c.url.hostname === "evolution.example.com");
    assert.equal(call?.url.href, "https://evolution.example.com/message/sendText/AJP%20VIP-test");
    assert.equal(call?.init?.method, "POST"); assert.equal(call?.init?.redirect, "manual");
    assert.equal(new Headers(call?.init?.headers).get("apikey"), "test-only-evolution");
    assert.equal(JSON.parse(String(call?.init?.body)).number, "5516997855438");
    assert.equal(JSON.stringify(body).includes("test-only-evolution"), false);
  });
  test("store buyer lookup uses same owner", async () => {
    const { calls } = await run({ buyer: true });
    assert.equal(calls.find(c => c.url.pathname === "/rest/v1/store_buyers")?.url.searchParams.get("user_id"), `eq.${owner}`);
  });
  test("missing integration does not use another owner", async () => {
    const { body, calls } = await run({ configured: false });
    assert.equal(body.whatsapp, "owner_evolution_not_configured");
    assert.equal(calls.some(c => c.url.hostname === "evolution.example.com"), false);
  });
  test("redirect is not accepted as successful delivery", async () => {
    const { response } = await run({ deliveryStatus: 302 }); assert.equal(response.status, 502);
  });
});