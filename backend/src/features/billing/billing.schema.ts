import { z } from "zod";
import { DISCOUNT_TYPES } from "./billing.calc";

export const PAYMENT_METHODS = ["cash", "card", "gcash", "maya", "bank_transfer"] as const;
export const INVOICE_FILTERS = ["all", "unpaid", "paid", "void"] as const;
export const VOID_REASONS = [
  "Billed to the wrong patient",
  "Wrong service or amount",
  "Duplicate invoice",
  "Patient cancelled the treatment",
  "Payer or discount entered wrongly",
] as const;

const MAX_LINES = 30;
const MAX_QTY = 99;
const MAX_AMOUNT = 10_000_000;

export const invoiceIdSchema = z.uuid("Invalid invoice identifier");

const centavos = (message: string) =>
  z.coerce
    .number({ error: message })
    .gt(0, message)
    .max(MAX_AMOUNT, "That amount is too high.")
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Use at most 2 decimal places.");

const optionalText = (max: number) => z.string().trim().max(max).nullable().transform((v) => v || null);

export const paymentInputSchema = z
  .object({
    amount: centavos("Enter an amount above ₱0."),
    method: z.enum(PAYMENT_METHODS),
    reference: optionalText(80),
  })
  .refine((p) => p.method === "cash" || p.reference, { message: "Enter the reference number from the receipt or app.", path: ["reference"] });

export const checkoutSchema = z
  .object({
    patientId: z.uuid("Choose a patient"),
    appointmentId: z.union([z.uuid(), z.null()]),
    lines: z
      .array(
        z.object({
          serviceId: z.uuid("Choose a service from the price list"),
          qty: z.number().int().min(1).max(MAX_QTY),
          toothCode: z
            .string()
            .trim()
            .regex(/^([1-4][1-8]|[5-8][1-5])$/, "Use a tooth number like 16 or 55")
            .nullable()
            .or(z.literal("").transform(() => null)),
        }),
      )
      .min(1, "Add at least one service or item.")
      .max(MAX_LINES),
    discountType: z.enum(DISCOUNT_TYPES),
    discountIdNo: optionalText(60),
    hmo: z.boolean(),
    loaNo: optionalText(60),
    payment: paymentInputSchema.nullable(),
  })
  .refine((c) => c.discountType === "none" || c.discountIdNo, { message: "Enter the senior citizen or PWD ID number.", path: ["discountIdNo"] })
  .refine((c) => !c.hmo || c.discountType === "none", { message: "An HMO can't be used with a senior citizen or PWD discount.", path: ["hmo"] })
  .refine((c) => !c.hmo || c.loaNo, { message: "Enter the HMO letter of authorization (LOA) number.", path: ["loaNo"] });

export const listInvoicesQuerySchema = z.object({
  filter: z.enum(INVOICE_FILTERS).catch("all"),
  search: z.string().trim().max(100).optional().transform((v) => v || undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export const voidReasonSchema = z.object({ reason: z.enum(VOID_REASONS, "Pick a reason for cancelling.") });
export const voidDecisionSchema = z.object({ approve: z.boolean() });
