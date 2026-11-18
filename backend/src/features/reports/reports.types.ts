import type { REPORT_PERIODS } from "./reports.schema";

export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export interface Kpi {
  label: string;
  value: number;
  /** The same figure for the period before, to compare against. */
  previous: number;
  format: "peso" | "count" | "percent";
}

export interface Bar {
  label: string;
  value: number;
}

export interface Overview {
  period: ReportPeriod;
  from: string;
  to: string;
  kpis: Kpi[];
  revenueByMonth: Bar[];
  newPatientsBySource: Bar[];
  bookingsBySource: Bar[];
  revenueByDentist: Bar[];
}

export interface SalesRow {
  label: string;
  invoices: number;
  billed: number;
}

export interface SalesInvoiceRow {
  id: string;
  number: string;
  issuedAt: Date;
  patient: string;
  dentist: string | null;
  payer: string;
  services: string;
  total: number;
  paid: number;
  balance: number;
  status: string;
}

export interface SalesReport {
  month: string;
  invoiceCount: number;
  gross: number;
  discounts: number;
  vat: number;
  total: number;
  collected: number;
  unpaid: number;
  byDentist: SalesRow[];
  byPayer: SalesRow[];
  byMethod: Bar[];
  invoices: SalesInvoiceRow[];
}

export interface LeadsSourceRow {
  source: string;
  received: number;
  won: number;
  lost: number;
  value: number;
}

export interface LeadsReport {
  month: string;
  received: number;
  won: number;
  lost: number;
  /** Won ÷ (won + lost); null when nothing closed. */
  winRate: number | null;
  wonValue: number;
  previous: { month: string; received: number; won: number; lost: number; wonValue: number };
  /** Leads received this month that are still open. */
  stillOpen: number;
  /** Average days from enquiry to won, for leads won this month; null when none. */
  avgDaysToWin: number | null;
  bySource: LeadsSourceRow[];
  byStaff: LeadsStaffRow[];
  lostReasons: Bar[];
  /** How far this month's leads have got: received, assigned, reached, consult booked, won. */
  funnel: Bar[];
}

export interface LeadsStaffRow {
  name: string;
  assigned: number;
  calls: number;
  won: number;
  lost: number;
  value: number;
}
