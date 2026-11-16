import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { normalizeEvolutionUrl, normalizeEvolutionInstance, evolutionConnected, evolutionRequest } from "./evolution-api";
describe("Evolution integration", () => {
  test("instance names accept internal spaces without changing the instance identity", () => {
    assert.equal(normalizeEvolutionInstance("  AJP VIP  "), "AJP VIP");
    assert.equal(evolutionRequest({ base_url: "https://api.seudominio.com.br", instance_name: "AJP VIP", api_key: "test-only" }, "status").url, "https://api.seudominio.com.br/instance/connectionState/AJP%20VIP");
  });
  test("instance names accept hyphens", () => {
    assert.equal(normalizeEvolutionInstance("ajp-vip"), "ajp-vip");
    assert.equal(evolutionRequest({ base_url: "https://api.seudominio.com.br", instance_name: "ajp-vip", api_key: "test-only" }, "qr").url, "https://api.seudominio.com.br/instance/connect/ajp-vip");
  });
  test("empty, oversized, control-character and path-like names are rejected", () => {
    for (const value of ["   ", "x".repeat(101), "ajp/vip", "ajp\nvip", "ajp?key=x"]) assert.throws(() => normalizeEvolutionInstance(value));
  });
  test("base URL has no trailing slash", () => { assert.equal(normalizeEvolutionUrl(" https://api.seudominio.com.br/ "), "https://api.seudominio.com.br"); });
  test("unsafe URLs are rejected", () => { for (const url of ["http://api.seudominio.com.br", "https://127.0.0.1", "https://localhost", "https://api.example.com?key=x", "https://user:password@api.example.com"]) assert.throws(() => normalizeEvolutionUrl(url)); });
  test("only an open instance is connected", () => {
    assert.equal(evolutionConnected({ instance: { state: "open" } }), true);
    assert.equal(evolutionConnected({ instance: { state: "connecting" } }), false);
    assert.equal(evolutionConnected({}), false);
  });
  test("text endpoint uses the selected instance and Evolution payload", () => {
    const request = evolutionRequest({ base_url: "https://api.seudominio.com.br", instance_name: "ajpvip", api_key: "test-only" }, "send", { phone: "5519999999999", message: "Aviso" });
    assert.equal(request.url, "https://api.seudominio.com.br/message/sendText/ajpvip");
    assert.equal(request.init.method, "POST");
    assert.equal(request.init.headers.apikey, "test-only");
    assert.deepEqual(JSON.parse(request.init.body ?? "{}"), { number: "5519999999999", text: "Aviso" });
    assert.equal(request.init.redirect, "error");
  });
});