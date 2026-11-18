import { z } from "zod";
import { clinicToday } from "@backend/config/clinic";
import { PAYMENT_METHODS } from "@backend/features/billing/billing.schema";

/** Methods that settle into a bank or e-wallet account and so can be matched to a deposit. */
export const NON_CASH_METHODS = PAYMENT_METHODS.filter((m) => m !== "cash");

const MAX_AMOUNT = 10_000_000;
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);

export const bankAccountInputSchema = z.object({
  label: z.string().trim().min(2, "Enter the bank or e-wallet name").max(60),
  lastFour: z
    .string()
    .trim()
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || /^\d{4}$/.test(v), "Enter the last 4 digits of the account number"),
});

export const depositInputSchema = z.object({
  bankAccountId: z.uuid("Choose the account"),
  postedOn: z.iso.date("Pick the date it reached the bank").refine((d) => d <= clinicToday(), "The date can't be in the future"),
  amount: z.coerce
    .number({ error: "Enter an amount above ₱0." })
    .gt(0, "Enter an amount above ₱0.")
    .max(MAX_AMOUNT, "That amount is too high.")
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Use at most 2 decimal places."),
  reference: optionalText(80),
  description: optionalText(500),
});

export const matchInputSchema = z.object({
  transactionId: z.uuid("Invalid deposit"),
  paymentId: z.uuid("Choose the payment"),
});

export const transactionIdSchema = z.uuid("Invalid deposit");
