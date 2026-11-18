import "server-only";
import { z } from "zod";
import type { AuthUser } from "@backend/lib/authorization";
import { AUDIT_ACTIONS, type AuditAction } from "@backend/lib/logging/audit";
import { assertBillingTab } from "../billing.access";
import { billingAuditRepository } from "./billing-audit.repository";

const PAGE_SIZE = 50;

export const AUDIT_GROUPS = {
  invoices: { label: "Invoices", prefixes: ["invoice."] },
  payments: { label: "Payments", prefixes: ["payment.", "installment."] },
  claims: { label: "HMO claims", prefixes: ["claim."] },
  plans: { label: "Payment plans", prefixes: ["payment_plan."] },
  bank: { label: "Bank", prefixes: ["bank_account.", "bank_transaction."] },
  expenses: { label: "Expenses", prefixes: ["expense."] },
} as const;

export type AuditGroup = keyof typeof AUDIT_GROUPS;

const ACTION_LABELS: Partial<Record<AuditAction, string>> = {
  [AUDIT_ACTIONS.INVOICE_ISSUED]: "Issued an invoice",
  [AUDIT_ACTIONS.INVOICE_ADJUSTED]: "Adjusted an invoice",
  [AUDIT_ACTIONS.INVOICE_VOID_REQUESTED]: "Asked to cancel an invoice",
  [AUDIT_ACTIONS.INVOICE_VOID_DECLINED]: "Declined a cancellation",
  [AUDIT_ACTIONS.INVOICE_VOIDED]: "Cancelled an invoice",
  [AUDIT_ACTIONS.PAYMENT_RECORDED]: "Recorded a payment",
  [AUDIT_ACTIONS.PAYMENT_CORRECTED]: "Corrected a payment",
  [AUDIT_ACTIONS.CLAIM_UPDATED]: "Updated an HMO claim",
  [AUDIT_ACTIONS.PAYMENT_PLAN_CREATED]: "Set up a payment plan",
  [AUDIT_ACTIONS.PAYMENT_PLAN_CANCELLED]: "Cancelled a payment plan",
  [AUDIT_ACTIONS.INSTALLMENT_PAID]: "Recorded an installment",
  [AUDIT_ACTIONS.BANK_ACCOUNT_ADDED]: "Added a bank account",
  [AUDIT_ACTIONS.BANK_TRANSACTION_ADDED]: "Added a bank deposit",
  [AUDIT_ACTIONS.BANK_TRANSACTION_MATCHED]: "Matched a deposit to a payment",
  [AUDIT_ACTIONS.BANK_TRANSACTION_UNMATCHED]: "Unmatched a deposit",
  [AUDIT_ACTIONS.EXPENSE_RECORDED]: "Recorded an expense",
  [AUDIT_ACTIONS.EXPENSE_DELETED]: "Deleted an expense",
};

const actionsIn = (prefixes: readonly string[]) => Object.values(AUDIT_ACTIONS).filter((a) => prefixes.some((p) => a.startsWith(p)));

const querySchema = z.object({
  group: z.enum(Object.keys(AUDIT_GROUPS) as [AuditGroup, ...AuditGroup[]]).optional().catch(undefined),
  before: z.coerce.bigint().positive().optional().catch(undefined),
});

export interface BillingAuditEntry {
  id: string;
  occurredAt: Date;
  actor: string | null;
  action: string;
  label: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
}

export interface BillingAuditPage {
  group: AuditGroup | null;
  entries: BillingAuditEntry[];
  /** Cursor for the next (older) page, if any. */
  olderThan: string | null;
}

/** Billing changes, newest first, from the audit log. */
export async function getBillingAudit(user: AuthUser, rawQuery: unknown): Promise<BillingAuditPage> {
  assertBillingTab(user, "audit");
  const { group, before } = querySchema.parse(rawQuery);
  const prefixes = group ? AUDIT_GROUPS[group].prefixes : Object.values(AUDIT_GROUPS).flatMap((g) => g.prefixes);
  const rows = await billingAuditRepository.list(user.clinicId, actionsIn(prefixes), before, PAGE_SIZE + 1);
  const page = rows.slice(0, PAGE_SIZE);
  return {
    group: group ?? null,
    entries: page.map((r) => ({
      id: r.id.toString(),
      occurredAt: r.occurredAt,
      actor: r.actor?.fullName ?? null,
      action: r.action,
      label: ACTION_LABELS[r.action as AuditAction] ?? r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      details: r.afterData && typeof r.afterData === "object" && !Array.isArray(r.afterData) ? (r.afterData as Record<string, unknown>) : null,
    })),
    olderThan: rows.length > PAGE_SIZE ? page[page.length - 1].id.toString() : null,
  };
}
