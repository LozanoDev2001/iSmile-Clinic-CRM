import type { z } from "zod";
import type { InvoiceSummary, PatientRef } from "../billing.types";
import type { PLAN_FILTERS, createPlanSchema, payInstallmentSchema } from "./plans.schema";

export type PlanFilter = (typeof PLAN_FILTERS)[number];
export type CreatePlanInput = z.input<typeof createPlanSchema>;
export type PayInstallmentInput = z.input<typeof payInstallmentSchema>;

/** Stored plan status plus "overdue", derived from an unpaid installment past its due date. */
export type PlanStatus = "active" | "overdue" | "completed" | "cancelled";
export type InstallmentStatus = "due" | "paid" | "cancelled";

export interface Installment {
  id: string;
  /** Clinic-local date, YYYY-MM-DD. */
  dueOn: string;
  amount: number;
  status: InstallmentStatus;
  overdue: boolean;
  paidAt: Date | null;
}

export interface PlanSummary {
  id: string;
  patient: PatientRef;
  invoice: { id: string; number: string } | null;
  status: PlanStatus;
  total: number;
  paidAmount: number;
  monthly: number;
  installmentsPaid: number;
  /** Installments that count toward the plan (cancelled ones left out). */
  installmentsTotal: number;
  nextDue: Installment | null;
  createdAt: Date;
}

export interface PlanDetail extends PlanSummary {
  installments: Installment[];
}

export interface PlansBoard {
  filter: PlanFilter;
  plans: PlanSummary[];
  counts: Record<PlanFilter, number>;
  selected: PlanDetail | null;
  /** Unpaid invoices without an active plan; empty when the user can't create plans. */
  eligibleInvoices: InvoiceSummary[];
}
