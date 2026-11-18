import "server-only";
import { clinicInstant, clinicToday } from "@backend/config/clinic";
import { round2 } from "@backend/features/billing/billing.calc";
import { assertPermission, type AuthUser } from "@backend/lib/authorization";
import { monthQuerySchema, overviewQuerySchema } from "./reports.schema";
import { reportsRepository } from "./reports.repository";
import type { Bar, LeadsReport, Overview, ReportPeriod, SalesReport, SalesRow } from "./reports.types";

const PERIOD_MONTHS: Record<ReportPeriod, number> = { month: 1, quarter: 3, year: 12 };
const TREND_MONTHS: Record<ReportPeriod, number> = { month: 6, quarter: 6, year: 12 };
const DIRECT = "Direct (walk-in, call, referral)";
const UNKNOWN_SOURCE = "Unknown platform";
const NO_DENTIST = "No dentist";

/** "YYYY-MM" shifted by whole months. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

const startOf = (month: string) => clinicInstant(`${month}-01`);

/** The months a period covers, ending with the current month (or the start of the year). */
export function periodMonths(period: ReportPeriod, today = clinicToday()): { first: string; last: string } {
  const current = today.slice(0, 7);
  if (period === "year") return { first: `${today.slice(0, 4)}-01`, last: `${today.slice(0, 4)}-12` };
  return { first: addMonths(current, 1 - PERIOD_MONTHS[period]), last: current };
}

type InvoiceRow = Awaited<ReturnType<typeof reportsRepository.invoices>>[number];

const active = (rows: InvoiceRow[]) => rows.filter((i) => i.status !== "void");
/** Revenue: what was billed after discounts, before VAT. */
const netSales = (i: InvoiceRow) => i.subtotal.toNumber() - i.discountTotal.toNumber();
const sum = (values: number[]) => round2(values.reduce((a, b) => a + b, 0));
const paidOn = (i: InvoiceRow) => sum(i.paymentAllocations.filter((a) => a.payment.status === "posted").map((a) => a.amount.toNumber()));

function tally<T>(items: T[], key: (item: T) => string, value: (item: T) => number = () => 1): Bar[] {
  const totals = new Map<string, number>();
  for (const item of items) totals.set(key(item), (totals.get(key(item)) ?? 0) + value(item));
  return [...totals].map(([label, v]) => ({ label, value: round2(v) })).sort((a, b) => b.value - a.value);
}

function payerLabel(i: InvoiceRow) {
  if (i.discountType === "sc") return "Senior citizen";
  if (i.discountType === "pwd") return "PWD";
  return i.payer?.name ?? "Self-pay";
}

async function periodFigures(clinicId: string, from: Date, to: Date) {
  const [invoices, payments, patients, appointments] = await Promise.all([
    reportsRepository.invoices(clinicId, from, to),
    reportsRepository.payments(clinicId, from, to),
    reportsRepository.newPatients(clinicId, from, to),
    reportsRepository.appointments(clinicId, from, to),
  ]);
  const completed = appointments.filter((a) => a.status === "completed").length;
  const noShows = appointments.filter((a) => a.status === "no_show").length;
  return {
    invoices,
    patients,
    appointments,
    revenue: sum(active(invoices).map(netSales)),
    collected: sum(payments.map((p) => p.amount.toNumber())),
    newPatients: patients.length,
    visits: completed,
    noShowRate: completed + noShows ? round2((noShows / (completed + noShows)) * 100) : 0,
  };
}

export async function getOverview(user: AuthUser, rawQuery: unknown): Promise<Overview> {
  assertPermission(user, "reports.read");
  const { period } = overviewQuerySchema.parse(rawQuery);
  const { first, last } = periodMonths(period);
  const span = PERIOD_MONTHS[period];
  const [now, before] = await Promise.all([
    periodFigures(user.clinicId, startOf(first), startOf(addMonths(last, 1))),
    periodFigures(user.clinicId, startOf(addMonths(first, -span)), startOf(first)),
  ]);

  const trendFirst = addMonths(last, 1 - TREND_MONTHS[period]);
  const trendInvoices = active(await reportsRepository.invoices(user.clinicId, startOf(trendFirst), startOf(addMonths(last, 1))));
  const revenueByMonth = Array.from({ length: TREND_MONTHS[period] }, (_, k) => {
    const month = addMonths(trendFirst, k);
    return { label: month, value: sum(trendInvoices.filter((i) => i.issuedAt >= startOf(month) && i.issuedAt < startOf(addMonths(month, 1))).map(netSales)) };
  });

  return {
    period,
    from: first,
    to: last,
    kpis: [
      { label: "Revenue", value: now.revenue, previous: before.revenue, format: "peso" },
      { label: "Collected", value: now.collected, previous: before.collected, format: "peso" },
      { label: "New patients", value: now.newPatients, previous: before.newPatients, format: "count" },
      { label: "Visits completed", value: now.visits, previous: before.visits, format: "count" },
      { label: "No-show rate", value: now.noShowRate, previous: before.noShowRate, format: "percent" },
    ],
    revenueByMonth,
    newPatientsBySource: tally(now.patients, (p) => (p.leads[0] ? (p.leads[0].source?.name ?? UNKNOWN_SOURCE) : DIRECT)),
    bookingsBySource: tally(
      now.appointments.filter((a) => a.status !== "cancelled"),
      (a) => a.bookingSource ?? "front_desk",
    ),
    revenueByDentist: tally(active(now.invoices), (i) => i.appointment?.dentist?.fullName ?? NO_DENTIST, netSales),
  };
}

function salesRows(invoices: InvoiceRow[], key: (i: InvoiceRow) => string): SalesRow[] {
  const rows = new Map<string, SalesRow>();
  for (const i of invoices) {
    const label = key(i);
    const row = rows.get(label) ?? { label, invoices: 0, billed: 0 };
    row.invoices += 1;
    row.billed = round2(row.billed + i.grandTotal.toNumber());
    rows.set(label, row);
  }
  return [...rows.values()].sort((a, b) => b.billed - a.billed);
}

export async function getSalesReport(user: AuthUser, rawQuery: unknown): Promise<SalesReport> {
  assertPermission(user, "reports.read");
  const month = monthQuerySchema.parse(rawQuery).month ?? clinicToday().slice(0, 7);
  const from = startOf(month);
  const to = startOf(addMonths(month, 1));
  const [all, payments] = await Promise.all([reportsRepository.invoices(user.clinicId, from, to), reportsRepository.payments(user.clinicId, from, to)]);
  const issued = active(all);
  return {
    month,
    invoiceCount: issued.length,
    gross: sum(issued.map((i) => i.subtotal.toNumber())),
    discounts: sum(issued.map((i) => i.discountTotal.toNumber())),
    vat: sum(issued.map((i) => i.taxTotal.toNumber())),
    total: sum(issued.map((i) => i.grandTotal.toNumber())),
    collected: sum(payments.map((p) => p.amount.toNumber())),
    unpaid: sum(issued.map((i) => Math.max(0, i.grandTotal.toNumber() - i.hmoDue.toNumber() - paidOn(i)))),
    byDentist: salesRows(issued, (i) => i.appointment?.dentist?.fullName ?? NO_DENTIST),
    byPayer: salesRows(issued, payerLabel),
    byMethod: tally(payments, (p) => p.method, (p) => p.amount.toNumber()),
    invoices: all.map((i) => {
      const total = i.grandTotal.toNumber();
      const paid = paidOn(i);
      return {
        id: i.id,
        number: i.number,
        issuedAt: i.issuedAt,
        patient: `${i.patient.contact.fullName} · ${i.patient.patientNo}`,
        dentist: i.appointment?.dentist?.fullName ?? null,
        payer: payerLabel(i),
        services: i.invoiceItems.map((it) => it.description).join(", "),
        total,
        paid,
        balance: i.status === "void" ? 0 : Math.max(0, round2(total - i.hmoDue.toNumber() - paid)),
        status: i.status,
      };
    }),
  };
}

export async function getLeadsReport(user: AuthUser, rawQuery: unknown): Promise<LeadsReport> {
  assertPermission(user, "reports.read");
  const month = monthQuerySchema.parse(rawQuery).month ?? clinicToday().slice(0, 7);
  const from = startOf(month);
  const to = startOf(addMonths(month, 1));
  const [created, closed] = await Promise.all([reportsRepository.leadsCreated(user.clinicId, from, to), reportsRepository.leadsClosed(user.clinicId, from, to)]);
  const won = closed.filter((l) => l.status === "won");
  const lost = closed.filter((l) => l.status === "lost");
  const sourceOf = (l: { source: { name: string } | null }) => l.source?.name ?? UNKNOWN_SOURCE;

  const sources = new Set([...created.map(sourceOf), ...closed.map(sourceOf)]);
  const staff = new Set(closed.map((l) => l.assignedTo?.fullName ?? "Unassigned"));
  return {
    month,
    received: created.length,
    won: won.length,
    lost: lost.length,
    winRate: closed.length ? round2((won.length / closed.length) * 100) : null,
    wonValue: sum(won.map((l) => l.wonValue?.toNumber() ?? 0)),
    bySource: [...sources]
      .map((source) => ({
        source,
        received: created.filter((l) => sourceOf(l) === source).length,
        won: won.filter((l) => sourceOf(l) === source).length,
        lost: lost.filter((l) => sourceOf(l) === source).length,
        value: sum(won.filter((l) => sourceOf(l) === source).map((l) => l.wonValue?.toNumber() ?? 0)),
      }))
      .sort((a, b) => b.received - a.received),
    byStaff: [...staff].map((name) => ({
      name,
      won: won.filter((l) => (l.assignedTo?.fullName ?? "Unassigned") === name).length,
      lost: lost.filter((l) => (l.assignedTo?.fullName ?? "Unassigned") === name).length,
    })),
    lostReasons: tally(lost, (l) => l.closedReason ?? "No reason given"),
  };
}
