import { z } from "zod";
import { clinicToday } from "@backend/config/clinic";

export const BILLING_REPORTS = ["collections", "aging", "revenue", "pnl"] as const;

export const EXPENSE_CATEGORIES = [
  "Rent",
  "Salaries and wages",
  "Dental supplies",
  "Laboratory fees",
  "Utilities",
  "Professional fees",
  "Marketing",
  "Repairs and maintenance",
  "Taxes and licenses",
  "Other",
] as const;

const MAX_AMOUNT = 10_000_000;

export const billingReportQuerySchema = z.object({
  report: z.enum(BILLING_REPORTS).catch("collections"),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().catch(undefined),
});

export const expenseIdSchema = z.uuid("Invalid expense identifier");

export const expenseInputSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES, "Choose a category."),
  amount: z.coerce
    .number({ error: "Enter an amount above ₱0." })
    .gt(0, "Enter an amount above ₱0.")
    .max(MAX_AMOUNT, "That amount is too high.")
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Use at most 2 decimal places."),
  incurredOn: z.iso.date("Pick the date of the expense.").refine((d) => d <= clinicToday(), "The date can't be in the future."),
  description: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => v || null),
});
