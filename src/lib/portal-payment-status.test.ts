import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { invoicePaymentStatus } from "./portal-payment-status";

describe("invoice confirmation", () => {
  test("confirms Mercado Pago approval", () => {
    assert.equal(invoicePaymentStatus({ status: "approved" }), "approved");
  });
  test("confirms an invoice marked paid even when provider status is stale", () => {
    assert.equal(invoicePaymentStatus({ status: "pending", paid: true }), "approved");
    assert.equal(invoicePaymentStatus({ status: "paid" }), "approved");
  });
  test("never confirms a pending or rejected invoice", () => {
    assert.equal(invoicePaymentStatus({ status: "pending", paid: false }), "pending");
    assert.equal(invoicePaymentStatus({ status: "rejected", paid: false }), "rejected");
    assert.equal(invoicePaymentStatus({}), "pending");
  });
});