import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { handleWebhook, normalizeBrazilPhone, evolutionSendRequest } from "../../docs/mp-webhook-evolution";

const renewalId = "11111111-1111-4111-8111-111111111111";
const owner = "22222222-2222-4222-8222-222222222222";
const secrets: Record<string, string> = {
  MP_WEBHOOK_SECRET: "test-only-signature",
  SUPABASE_URL: "https://external.example.com",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test-only",
  PORTAL_PAYMENT_PROCESSOR_URL: "https://portal.example.com/api/public/portal/mp-webhook",
};
async function signedRequest() {
  const ts = "1794868560";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secrets.MP_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`id:12345;request-id:test-request;ts:${ts};`));
  const hex = [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return new Request("https://external.example.com/functions/v1/mp-webhook?data.id=12345", {
    method: "POST", headers: { "x-request-id": "test-request", "x-signature": `ts=${ts},v1=${hex}` },
    body: JSON.stringify({ type: "payment", data: { id: "12345" } }),
  });
}
async function run(status = "approved", skipped?: string, mismatch = false, whatsapp?: string) {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const fake: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    const respond = (data: unknown) => Response.json(data);
    if (url.pathname === "/rest/v1/renewal_requests") return respond(url.searchParams.get("select") === "status" ? [{ status: "paid" }] : [{
      id: renewalId, user_id: owner, client_id: "client-id", days: 30, amount_cents: 3000, mp_payment_id: "12345",
    }]);
    if (url.pathname === "/rest/v1/settings") return respond([{ mp_access_token: "test-only-mp" }]);
    if (url.hostname === "api.mercadopago.com") return respond({ id: 12345, status, external_reference: renewalId, transaction_amount: mismatch ? 15 : 30 });
    if (url.pathname === "/api/public/portal/mp-webhook") return respond({ ok: true, ...(skipped ? { skipped } : {}), ...(whatsapp ? { whatsapp } : {}) });
    if (url.pathname === "/rest/v1/clients") return respond([{ name: "Teste", phone: "(16) 99785-5438" }]);
    if (url.pathname === "/rest/v1/evolution_integrations") return respond([{ base_url: "https://evolution.example.com/", instance_name: "AJP VIP-test", api_key: "test-only-evolution" }]);
    if (url.hostname === "evolution.example.com") return respond({ key: { id: "test-only-message" } });
    throw new Error(`unexpected ${url.pathname}`);
  };
  const response = await handleWebhook(await signedRequest(), name => secrets[name], fake);
  return { response, calls, body: await response.json() };
}
describe("External Mercado Pago Evolution webhook", () => {
  test("updated portal already attempted WhatsApp, including failures: adapter must not duplicate", async () => {
    for (const whatsapp of ["accepted", "failed"]) {
      const { calls, body } = await run("approved", undefined, false, whatsapp);
      assert.equal(body.whatsapp, whatsapp);
      assert.equal(calls.some(call => call.url.hostname === "evolution.example.com"), false);
    }
  });
  test("client masks normalize to 5516997855438 without duplicating country code", () => {
    for (const phone of ["(16) 99785-5438", "16997855438", "+55 (16) 99785-5438", "005516997855438"]) assert.equal(normalizeBrazilPhone(phone), "5516997855438");
    assert.throws(() => normalizeBrazilPhone("997855438"));
  });
  test("approved payment sends through the same owner's credentials after processing", async () => {
    const { response, calls, body } = await run();
    assert.equal(response.status, 200);
    assert.equal(body.whatsapp, "accepted");
    const config = calls.find(call => call.url.pathname === "/rest/v1/evolution_integrations");
    assert.equal(config?.url.searchParams.get("user_id"), `eq.${owner}`);
    const contact = calls.find(call => call.url.pathname === "/rest/v1/clients");
    assert.equal(contact?.url.searchParams.get("user_id"), `eq.${owner}`);
    const sent = calls.find(call => call.url.hostname === "evolution.example.com");
    assert.equal(sent?.url.href, "https://evolution.example.com/message/sendText/AJP%20VIP-test");
    assert.equal(sent?.init?.method, "POST");
    assert.equal(sent?.init?.redirect, "manual");
    assert.equal((sent?.init?.headers as Record<string, string>)?.apikey, "test-only-evolution");
    assert.equal(JSON.parse(String(sent?.init?.body)).number, "5516997855438");
    const processed = calls.findIndex(call => call.url.pathname === "/api/public/portal/mp-webhook");
    assert.ok(processed >= 0 && processed < calls.findIndex(call => call.url.hostname === "evolution.example.com"));
  });
  test("in_process and pending never send WhatsApp", async () => {
    for (const status of ["in_process", "pending"]) {
      const { calls, body } = await run(status);
      assert.equal(body.skipped, "not_approved");
      assert.equal(calls.some(call => call.url.hostname === "evolution.example.com"), false);
    }
  });
  test("repeated finalized webhook does not send again", async () => {
    const { calls, body } = await run("approved", "already processed");
    assert.equal(body.skipped, "already processed");
    assert.equal(calls.some(call => call.url.hostname === "evolution.example.com"), false);
  });
  test("invalid signature cannot access the database or send a message", async () => {
    let accessed = false;
    const response = await handleWebhook(new Request("https://external.example.com?data.id=12345", { method: "POST", body: "{}" }), name => secrets[name], async () => { accessed = true; return Response.json({}); });
    assert.equal(response.status, 401);
    assert.equal(accessed, false);
  });
  test("amount mismatch cannot finalize or notify", async () => {
    const { response, calls } = await run("approved", undefined, true);
    assert.equal(response.status, 409);
    assert.equal(calls.some(call => call.url.pathname === "/api/public/portal/mp-webhook" || call.url.hostname === "evolution.example.com"), false);
  });
  test("Evolution request rejects unsafe URL and uses manual redirects", () => {
    assert.throws(() => evolutionSendRequest({ base_url: "http://localhost", instance_name: "ajpvip", api_key: "test" }, "16997855438", "teste"));
    assert.equal(evolutionSendRequest({ base_url: "https://evolution.example.com", instance_name: "ajp-vip", api_key: "test" }, "16997855438", "teste").init.redirect, "manual");
  });
});