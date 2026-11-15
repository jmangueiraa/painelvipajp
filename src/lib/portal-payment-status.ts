/** The status endpoint also reports invoices marked paid by the webhook/admin. */
export function invoicePaymentStatus(result: { status?: string; paid?: boolean }): string {
  if (result.paid === true || result.status === "approved" || result.status === "paid") return "approved";
  return result.status || "pending";
}