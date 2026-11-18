"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@backend/lib/api/response";
import { requireAuth } from "@backend/lib/authorization";
import { cancelInvoice, checkout, decideVoidRequest, recordPayment } from "./billing.service";
import type { CheckoutInput, InvoiceSummary, PaymentInput } from "./billing.types";

// Invoices show in Billing, the calendar, patient files and the dashboard.
const revalidate = () => revalidatePath("/", "layout");

export async function checkoutAction(input: CheckoutInput): Promise<ActionResult<{ id: string; number: string }>> {
  return runAction(async () => {
    const issued = await checkout(await requireAuth(), input);
    revalidate();
    return issued;
  }, "Invoice issued.");
}

export async function recordPaymentAction(invoiceId: string, input: PaymentInput): Promise<ActionResult<InvoiceSummary>> {
  return runAction(async () => {
    const invoice = await recordPayment(await requireAuth(), invoiceId, input);
    revalidate();
    return invoice;
  }, "Payment recorded.");
}

export async function cancelInvoiceAction(invoiceId: string, reason: string): Promise<ActionResult<{ voided: boolean }>> {
  return runAction(async () => {
    const result = await cancelInvoice(await requireAuth(), invoiceId, { reason });
    revalidate();
    return result;
  });
}

export async function decideVoidRequestAction(invoiceId: string, approve: boolean): Promise<ActionResult> {
  return runAction(async () => {
    await decideVoidRequest(await requireAuth(), invoiceId, { approve });
    revalidate();
    return undefined;
  }, approve ? "Invoice cancelled." : "Request declined. The invoice stays.");
}
