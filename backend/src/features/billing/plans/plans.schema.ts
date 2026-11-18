import { z } from "zod";
import { PAYMENT_METHODS } from "../billing.schema";

export const MIN_INSTALLMENTS = 2;
export const MAX_INSTALLMENTS = 24;
export const PLAN_FILTERS = ["active", "overdue", "completed", "all"] as const;

export const planIdSchema = z.uuid("Invalid payment plan identifier");

export const createPlanSchema = z.object({
  invoiceId: z.uuid("Choose an unpaid invoice"),
  installments: z.coerce.number().int().min(MIN_INSTALLMENTS, `Use ${MIN_INSTALLMENTS} to ${MAX_INSTALLMENTS} months`).max(MAX_INSTALLMENTS, `Use ${MIN_INSTALLMENTS} to ${MAX_INSTALLMENTS} months`),
  firstDueOn: z.iso.date("Pick the first due date"),
});

export const payInstallmentSchema = z.object({
  installmentId: z.uuid("Invalid installment"),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(80).nullable().transform((v) => v || null),
});

export const plansQuerySchema = z.object({
  status: z.enum(PLAN_FILTERS).catch("active"),
  plan: z.uuid().optional().catch(undefined),
});
