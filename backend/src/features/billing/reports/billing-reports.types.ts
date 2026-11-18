import type { z } from "zod";
import type { BILLING_REPORTS, EXPENSE_CATEGORIES, expenseInputSchema } from "./billing-reports.schema";

export type BillingReportId = (typeof BILLING_REPORTS)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type ExpenseInput = z.input<typeof expenseInputSchema>;

export interface MethodTotal {
  method: string;
  count: number;
  amount: number;
  /** Share of patient payments, 0–1. */
  share: number;
}

export interface CollectionsReport {
  kind: "collections";
  month: string;
  methods: MethodTotal[];
  patientTotal: number;
  patientCount: number;
  hmo: { count: number; amount: number };
  total: number;
}

export interface AgedInvoice {
  id: string;
  number: string;
  patientName: string;
  patientNo: string;
  issuedAt: Date;
  days: number;
  balance: number;
}

export interface AgedClaim {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  payerName: string;
  patientName: string;
  submittedAt: Date | null;
  days: number;
  amount: number;
}

export interface AgeBucket<T> {
  label: string;
  total: number;
  items: T[];
}

export interface AgingReport {
  kind: "aging";
  asOf: string;
  invoices: AgeBucket<AgedInvoice>[];
  invoiceTotal: number;
  claims: AgeBucket<AgedClaim>[];
  claimTotal: number;
}

export interface RevenueRow {
  label: string;
  /** Invoices for a dentist, units for a service. */
  count: number;
  amount: number;
}

export interface RevenueReport {
  kind: "revenue";
  month: string;
  total: number;
  invoiceCount: number;
  byDentist: RevenueRow[];
  byService: RevenueRow[];
}

export interface Expense {
  id: string;
  category: string;
  amount: number;
  /** Clinic date, YYYY-MM-DD. */
  incurredOn: string;
  description: string | null;
}

export interface PnlReport {
  kind: "pnl";
  month: string;
  billed: number;
  vat: number;
  revenue: number;
  expenses: { category: string; amount: number }[];
  expenseTotal: number;
  netIncome: number;
  entries: Expense[];
}

export type BillingReport = CollectionsReport | AgingReport | RevenueReport | PnlReport;
