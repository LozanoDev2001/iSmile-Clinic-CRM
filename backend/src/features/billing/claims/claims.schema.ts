import { z } from "zod";

/** Statuses staff move a claim through; "cancelled" is set only when its invoice is cancelled. */
export const CLAIM_STATUSES = ["submitted", "approved", "paid", "denied"] as const;
export const CLAIM_FILTERS = [...CLAIM_STATUSES, "all"] as const;

export const DENIAL_REASONS = [
  "Not covered by the member's plan",
  "LOA expired or invalid",
  "Benefit limit reached",
  "Missing or incomplete documents",
  "Member not eligible on the visit date",
  "Duplicate claim",
] as const;

const MAX_AMOUNT = 10_000_000;

const amount = z.coerce
  .number({ error: "Enter an amount above ₱0." })
  .gt(0, "Enter an amount above ₱0.")
  .max(MAX_AMOUNT, "That amount is too high.")
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Use at most 2 decimal places.");

export const claimIdSchema = z.uuid("Invalid claim identifier");

export const claimsQuerySchema = z.object({ status: z.enum(CLAIM_FILTERS).catch("submitted") });

export const claimActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("approve"), amount }),
  z.object({
    type: z.literal("pay"),
    amount,
    paidOn: z.iso.date("Pick the date the HMO paid."),
    reference: z.string().trim().min(1, "Enter the check, deposit or remittance reference.").max(80),
  }),
  z.object({ type: z.literal("deny"), reason: z.enum(DENIAL_REASONS, "Pick a reason.") }),
]);
