import "server-only";
import { clinicDateOf, clinicInstant, clinicToday } from "@backend/config/clinic";
import { round2 } from "@backend/features/billing/billing.calc";
import { assertBillingTab } from "@backend/features/billing/billing.access";
import { billingRepository } from "@backend/features/billing/billing.repository";
import { addMonths } from "@backend/features/reports/reports.service";
import { assertPermission, type AuthUser } from "@backend/lib/authorization";
import { Errors } from "@backend/lib/errors/app-error";
import { AUDIT_ACTIONS, audit } from "@backend/lib/logging/audit";
import { prisma } from "@backend/lib/prisma";
import { billingReportQuerySchema, expenseIdSchema, expenseInputSchema } from "./billing-reports.schema";
import { billingReportsRepository } from "./billing-reports.repository";
import type { AgeBucket, AgingReport, BillingReport, CollectionsReport, ExpenseInput, PnlReport, RevenueReport, RevenueRow } from "./billing-reports.types";

const MS_PER_DAY = 86_400_000;
const NO_DENTIST = "No dentist on file";
export const AGE_BUCKETS = [
  { label: "0–30 days", maxDays: 30 },
  { label: "31–60 days", maxDays: 60 },
  { label: "61–90 days", maxDays: 90 },
  { label: "Over 90 days", maxDays: Infinity },
] as const;

const sum = (values: number[]) => round2(values.reduce((a, b) => a + b, 0));

/** Instants bounding a clinic-local month, for timestamp columns. */
export function monthInstants(month: string) {
  return { from: clinicInstant(`${month}-01`), to: clinicInstant(`${addMonths(month, 1)}-01`) };
}

/** UTC-midnight dates bounding a month, for DATE columns. */
export function monthDates(month: string) {
  return { from: new Date(`${month}-01T00:00:00Z`), to: new Date(`${addMonths(month, 1)}-01T00:00:00Z`) };
}

/** Whole clinic days from `date` to `today`. */
export const daysSince = (date: Date, today: string) => Math.max(0, Math.round((Date.parse(today) - Date.parse(clinicDateOf(date))) / MS_PER_DAY));

export function bucketByAge<T>(items: T[], days: (item: T) => number, amount: (item: T) => number): AgeBucket<T>[] {
  const buckets = AGE_BUCKETS.map((b) => ({ label: b.label, total: 0, items: [] as T[] }));
  for (const item of items) {
    const bucket = buckets[AGE_BUCKETS.findIndex((b) => days(item) <= b.maxDays)];
    bucket.items.push(item);
    bucket.total = round2(bucket.total + amount(item));
  }
  return buckets;
}

export function profitAndLoss(billed: number, vat: number, expenses: { category: string; amount: number }[]) {
  const revenue = round2(billed - vat);
  const expenseTotal = sum(expenses.map((e) => e.amount));
  return { revenue, expenseTotal, netIncome: round2(revenue - expenseTotal) };
}

function tally(entries: { label: string; count: number; amount: number }[]): RevenueRow[] {
  const totals = new Map<string, RevenueRow>();
  for (const e of entries) {
    const row = totals.get(e.label) ?? { label: e.label, count: 0, amount: 0 };
    totals.set(e.label, { label: e.label, count: row.count + e.count, amount: round2(row.amount + e.amount) });
  }
  return [...totals.values()].sort((a, b) => b.amount - a.amount);
}

async function collections(clinicId: string, month: string): Promise<CollectionsReport> {
  const { from, to } = monthInstants(month);
  const [rows, hmo] = await Promise.all([billingReportsRepository.paymentsByMethod(clinicId, from, to), billingReportsRepository.hmoPaid(clinicId, from, to)]);
  const patientTotal = sum(rows.map((r) => r._sum.amount?.toNumber() ?? 0));
  const methods = rows
    .map((r) => {
      const amount = r._sum.amount?.toNumber() ?? 0;
      return { method: r.method, count: r._count, amount, share: patientTotal ? amount / patientTotal : 0 };
    })
    .sort((a, b) => b.amount - a.amount);
  const hmoAmount = hmo._sum.paidAmount?.toNumber() ?? 0;
  return {
    kind: "collections",
    month,
    methods,
    patientTotal,
    patientCount: sum(rows.map((r) => r._count)),
    hmo: { count: hmo._count, amount: hmoAmount },
    total: round2(patientTotal + hmoAmount),
  };
}

async function aging(clinicId: string): Promise<AgingReport> {
  const today = clinicToday();
  const [unpaid, claims] = await Promise.all([billingRepository.unpaid(clinicId), billingReportsRepository.openClaims(clinicId)]);
  const invoices = unpaid.map((i) => ({ id: i.id, number: i.number, patientName: i.patient.name, patientNo: i.patient.patientNo, issuedAt: i.issuedAt, days: daysSince(i.issuedAt, today), balance: i.balance }));
  const openClaims = claims.map((c) => ({
    id: c.id,
    invoiceId: c.invoice.id,
    invoiceNumber: c.invoice.number,
    payerName: c.payer.name,
    patientName: c.invoice.patient.contact.fullName,
    submittedAt: c.submittedAt,
    days: c.submittedAt ? daysSince(c.submittedAt, today) : 0,
    amount: c.approvedAmount?.toNumber() ?? 0,
  }));
  return {
    kind: "aging",
    asOf: today,
    invoices: bucketByAge(invoices, (i) => i.days, (i) => i.balance),
    invoiceTotal: sum(invoices.map((i) => i.balance)),
    claims: bucketByAge(openClaims, (c) => c.days, (c) => c.amount),
    claimTotal: sum(openClaims.map((c) => c.amount)),
  };
}

async function revenue(clinicId: string, month: string): Promise<RevenueReport> {
  const { from, to } = monthInstants(month);
  const invoices = await billingReportsRepository.revenueInvoices(clinicId, from, to);
  // Revenue per line is the price-list amount less the SC/PWD discount, before VAT.
  const net = (i: (typeof invoices)[number]["invoiceItems"][number]) => i.lineTotal.toNumber() - i.discount.toNumber();
  const byDentist = tally(invoices.map((inv) => ({ label: inv.appointment?.dentist?.fullName ?? NO_DENTIST, count: 1, amount: sum(inv.invoiceItems.map(net)) })));
  const byService = tally(invoices.flatMap((inv) => inv.invoiceItems.map((i) => ({ label: i.description, count: i.qty.toNumber(), amount: net(i) }))));
  return { kind: "revenue", month, total: sum(byDentist.map((d) => d.amount)), invoiceCount: invoices.length, byDentist, byService };
}

async function pnl(clinicId: string, month: string): Promise<PnlReport> {
  const instants = monthInstants(month);
  const dates = monthDates(month);
  const [billedTotals, byCategory, entries] = await Promise.all([
    billingReportsRepository.billedTotals(clinicId, instants.from, instants.to),
    billingReportsRepository.expensesByCategory(clinicId, dates.from, dates.to),
    billingReportsRepository.expenses(clinicId, dates.from, dates.to),
  ]);
  const billed = billedTotals._sum.grandTotal?.toNumber() ?? 0;
  const vat = billedTotals._sum.taxTotal?.toNumber() ?? 0;
  const expenses = byCategory.map((c) => ({ category: c.category, amount: c._sum.amount?.toNumber() ?? 0 })).sort((a, b) => b.amount - a.amount);
  return {
    kind: "pnl",
    month,
    billed,
    vat,
    ...profitAndLoss(billed, vat, expenses),
    expenses,
    entries: entries.map((e) => ({ id: e.id, category: e.category, amount: e.amount.toNumber(), incurredOn: e.incurredOn.toISOString().slice(0, 10), description: e.description })),
  };
}

export async function getBillingReport(user: AuthUser, rawQuery: unknown): Promise<BillingReport> {
  assertBillingTab(user, "reports");
  const { report, month = clinicToday().slice(0, 7) } = billingReportQuerySchema.parse(rawQuery);
  if (report === "aging") return aging(user.clinicId);
  if (report === "revenue") return revenue(user.clinicId, month);
  if (report === "pnl") return pnl(user.clinicId, month);
  return collections(user.clinicId, month);
}

export async function addExpense(user: AuthUser, input: ExpenseInput): Promise<{ id: string }> {
  assertBillingTab(user, "reports");
  assertPermission(user, "billing.update");
  const data = expenseInputSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const created = await billingReportsRepository.createExpense(
      { clinicId: user.clinicId, category: data.category, amount: data.amount, incurredOn: new Date(`${data.incurredOn}T00:00:00Z`), description: data.description },
      tx,
    );
    await audit(
      { action: AUDIT_ACTIONS.EXPENSE_RECORDED, resourceType: "expense", resourceId: created.id, actorId: user.id, clinicId: user.clinicId, metadata: { category: data.category, amount: data.amount, incurredOn: data.incurredOn } },
      tx,
    );
    return created;
  });
}

export async function deleteExpense(user: AuthUser, rawId: unknown): Promise<void> {
  assertBillingTab(user, "reports");
  assertPermission(user, "billing.update");
  const id = expenseIdSchema.parse(rawId);
  await prisma.$transaction(async (tx) => {
    const expense = await billingReportsRepository.findExpense(user.clinicId, id, tx);
    if (!expense) throw Errors.notFound("expense");
    await billingReportsRepository.deleteExpense(id, tx);
    await audit(
      { action: AUDIT_ACTIONS.EXPENSE_DELETED, resourceType: "expense", resourceId: id, actorId: user.id, clinicId: user.clinicId, before: { category: expense.category, amount: expense.amount.toNumber() } },
      tx,
    );
  });
}
