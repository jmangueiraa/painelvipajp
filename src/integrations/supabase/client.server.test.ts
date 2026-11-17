import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { resolveSupabaseAdminConfig } from "./client.server";

describe("external administrative database configuration", () => {
  test("external credentials take precedence over managed configuration", () => {
    const result = resolveSupabaseAdminConfig({
      EXTERNAL_SUPABASE_URL: "https://external.example.com",
      EXTERNAL_SUPABASE_SERVICE_ROLE_KEY: "test-external-only",
      SUPABASE_URL: "https://managed.example.com",
      SUPABASE_SERVICE_ROLE_KEY: "test-managed-only",
    });
    assert.equal(result.url, "https://external.example.com");
    assert.ok(result.key === "test-external-only");
  });
  test("external key uses the configured browser database when no external URL is set", () => {
    const result = resolveSupabaseAdminConfig({
      EXTERNAL_SUPABASE_SERVICE_ROLE_KEY: "test-external-only",
      VITE_SUPABASE_URL: "https://zfafucaxbktpifydecng.supabase.co",
      SUPABASE_URL: "https://managed.example.com",
    });
    assert.equal(result.url, "https://zfafucaxbktpifydecng.supabase.co");
  });
  test("public keys are never used as administrative credentials", () => {
    assert.throws(() => resolveSupabaseAdminConfig({
      SUPABASE_URL: "https://external.example.com",
      SUPABASE_PUBLISHABLE_KEY: "test-public-only",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-public-only",
    }), /Credencial administrativa/);
  });
});