import "server-only";
import { Prisma } from "@backend/generated/prisma/client";
import { prisma, type TransactionClient } from "@backend/lib/prisma";
import { round2, type DiscountType, type InvoiceTotals } from "./billing.calc";
import type { InvoiceFilter, InvoiceStatus, InvoiceSummary, PaymentMethod } from "./billing.types";

const PAGE_SIZE = 50;
const LATEST_PAYMENTS = 8;
/** Payments that count as money received (not flagged for refund after a cancellation). */
const POSTED = "posted";

const summarySelect = {
  id: true,
  number: true,
  issuedAt: true,
  status: true,
  grandTotal: true,
  hmoDue: true,
  discountType: true,
  patient: { select: { id: true, patientNo: true, contact: { select: { fullName: true } } } },
  payer: { select: { name: true } },
  paymentAllocations: { select: { amount: true, payment: { select: { status: true } } } },
} satisfies Prisma.InvoiceSelect;

type SummaryRow = Prisma.InvoiceGetPayload<{ select: typeof summarySelect }>;

export function toSummary(row: SummaryRow): InvoiceSummary {
  const total = row.grandTotal.toNumber();
  const hmoDue = row.hmoDue.toNumber();
  const patientDue = round2(total - hmoDue);
  const paid = round2(row.paymentAllocations.filter((a) => a.payment.status === POSTED).reduce((s, a) => s + a.amount.toNumber(), 0));
  return {
    id: row.id,
    number: row.number,
    issuedAt: row.issuedAt,
    status: row.status as InvoiceStatus,
    patient: { id: row.patient.id, name: row.patient.contact.fullName, patientNo: row.patient.patientNo },
    payerName: row.payer?.name ?? null,
    discountType: row.discountType as DiscountType,
    total,
    hmoDue,
    patientDue,
    paid,
    balance: row.status === "void" ? 0 : Math.max(0, round2(patientDue - paid)),
  };
}

const detailSelect = {
  ...summarySelect,
  subtotal: true,
  discountTotal: true,
  discountIdNo: true,
  vatableSales: true,
  vatExemptSales: true,
  taxTotal: true,
  appointmentId: true,
  voidReason: true,
  voidedAt: true,
  createdBy: { select: { fullName: true } },
  appointment: { select: { dentist: { select: { fullName: true } } } },
  claims: { select: { loaNo: true }, take: 1 },
  invoiceItems: { select: { description: true, qty: true, unitPrice: true, lineTotal: true, discount: true }, orderBy: { position: "asc" } },
  paymentAllocations: {
    select: {
      amount: true,
      payment: { select: { id: true, amount: true, method: true, reference: true, receivedAt: true, status: true, recordedBy: { select: { fullName: true } } } },
    },
    orderBy: { payment: { receivedAt: "asc" } },
  },
  invoiceVoidRequests: {
    where: { status: "pending" },
    take: 1,
    select: { id: true, reason: true, createdAt: true, requestedBy: { select: { fullName: true } } },
  },
} satisfies Prisma.InvoiceSelect;

function filterWhere(filter: InvoiceFilter): Prisma.InvoiceWhereInput {
  if (filter === "unpaid") return { status: { in: ["issued", "part_paid"] } };
  if (filter === "paid") return { status: "paid" };
  if (filter === "void") return { status: "void" };
  return {};
}

const unpaidWhere = (clinicId: string): Prisma.InvoiceWhereInput => ({ clinicId, status: { in: ["issued", "part_paid"] } });

interface InvoiceData {
  patientId: string;
  payerId: string | null;
  appointmentId: string | null;
  number: string;
  status: InvoiceStatus;
  discountType: DiscountType;
  discountIdNo: string | null;
  totals: InvoiceTotals;
  createdById: string;
  items: { serviceId: string; description: string; qty: number; unitPrice: number; taxType: string; amount: number; discount: number }[];
}

export const billingRepository = {
  async list(clinicId: string, query: { filter: InvoiceFilter; search?: string; page: number }) {
    const where: Prisma.InvoiceWhereInput = {
      clinicId,
      ...filterWhere(query.filter),
      ...(query.search
        ? { OR: [{ number: { contains: query.search } }, { patient: { contact: { fullName: { contains: query.search } } } }, { patient: { patientNo: { startsWith: query.search } } }] }
        : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.invoice.findMany({ where, select: summarySelect, orderBy: { issuedAt: "desc" }, skip: (query.page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      prisma.invoice.count({ where }),
    ]);
    return { items: rows.map(toSummary), total, page: query.page, pageSize: PAGE_SIZE };
  },

  findDetail(clinicId: string, id: string, tx: TransactionClient = prisma) {
    return tx.invoice.findFirst({ where: { id, clinicId }, select: detailSelect });
  },

  findSummary(clinicId: string, id: string, tx: TransactionClient = prisma) {
    return tx.invoice.findFirst({ where: { id, clinicId }, select: { ...summarySelect, appointmentId: true } });
  },

  /** Locks the invoice row so concurrent payments can't overpay it. */
  async lock(id: string, tx: TransactionClient) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM invoices WHERE id = ${id} FOR UPDATE`);
  },

  /** The invoice for an appointment that hasn't been cancelled, if any. */
  activeForAppointment(appointmentId: string, tx: TransactionClient = prisma) {
    return tx.invoice.findFirst({ where: { appointmentId, status: { not: "void" } }, select: { id: true, number: true } });
  },

  /** Active invoices for a set of appointments, for the calendar. */
  forAppointments(clinicId: string, appointmentIds: string[]) {
    if (!appointmentIds.length) return Promise.resolve([]);
    return prisma.invoice.findMany({ where: { clinicId, appointmentId: { in: appointmentIds }, status: { not: "void" } }, select: { ...summarySelect, appointmentId: true } });
  },

  /** Highest number used in the clinic's SI-0000001, SI-0000002, … invoice numbers (0 if none). */
  async maxInvoiceNumber(clinicId: string, tx: TransactionClient) {
    const [row] = await tx.$queryRaw<{ n: bigint | number | null }[]>(
      Prisma.sql`SELECT MAX(CAST(SUBSTRING(number, 4) AS UNSIGNED)) AS n FROM invoices WHERE clinic_id = ${clinicId} AND number LIKE 'SI-%'`,
    );
    return Number(row?.n ?? 0);
  },

  async createInvoice(clinicId: string, data: InvoiceData, tx: TransactionClient) {
    const { totals } = data;
    return tx.invoice.create({
      data: {
        clinicId,
        patientId: data.patientId,
        payerId: data.payerId,
        appointmentId: data.appointmentId,
        number: data.number,
        status: data.status,
        discountType: data.discountType,
        discountIdNo: data.discountIdNo,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        vatableSales: totals.vatableSales,
        vatExemptSales: totals.vatExemptSales,
        taxTotal: totals.vat,
        grandTotal: totals.total,
        hmoDue: totals.hmoDue,
        createdById: data.createdById,
        invoiceItems: {
          create: data.items.map((i, position) => ({ position, serviceId: i.serviceId, description: i.description, qty: i.qty, unitPrice: i.unitPrice, taxType: i.taxType, lineTotal: i.amount, discount: i.discount })),
        },
      },
      select: { id: true },
    });
  },

  createClaim(data: { clinicId: string; invoiceId: string; payerId: string; loaNo: string; amount: number }, tx: TransactionClient) {
    return tx.claim.create({
      data: { clinicId: data.clinicId, invoiceId: data.invoiceId, payerId: data.payerId, loaNo: data.loaNo, status: "submitted", submittedAt: new Date(), approvedAmount: data.amount },
    });
  },

  async createPayment(data: { clinicId: string; patientId: string; invoiceId: string; amount: number; method: PaymentMethod; reference: string | null; recordedById: string }, tx: TransactionClient) {
    const payment = await tx.payment.create({
      data: { clinicId: data.clinicId, patientId: data.patientId, amount: data.amount, method: data.method, reference: data.reference, recordedById: data.recordedById, status: POSTED },
      select: { id: true },
    });
    await tx.paymentAllocation.create({ data: { paymentId: payment.id, invoiceId: data.invoiceId, amount: data.amount } });
    return payment;
  },

  setStatus(id: string, status: InvoiceStatus, tx: TransactionClient) {
    return tx.invoice.update({ where: { id }, data: { status } });
  },

  /** Records what was done in the visit, so the patient's history and dental chart fill in. */
  async recordTreatments(
    data: { clinicId: string; patientId: string; dentistId: string | null; encounterId: string; items: { serviceId: string; toothCode: string | null; qty: number; unitPrice: number }[] },
    tx: TransactionClient,
  ) {
    await tx.treatmentPlan.create({
      data: {
        clinicId: data.clinicId,
        patientId: data.patientId,
        dentistId: data.dentistId,
        status: "completed",
        treatmentItems: {
          create: data.items.map((i) => ({ serviceId: i.serviceId, toothCode: i.toothCode, qty: i.qty, quotedUnitPrice: i.unitPrice, status: "done", encounterId: data.encounterId })),
        },
      },
    });
  },

  findEncounter(appointmentId: string, tx: TransactionClient) {
    return tx.encounter.findFirst({ where: { appointmentId }, select: { id: true } });
  },

  async voidInvoice(id: string, reason: string, tx: TransactionClient) {
    await tx.invoice.update({ where: { id }, data: { status: "void", voidReason: reason, voidedAt: new Date() } });
    // Money already taken is flagged for refund rather than deleted.
    await tx.payment.updateMany({ where: { paymentAllocations: { some: { invoiceId: id } }, status: POSTED }, data: { status: "refund_due" } });
    await tx.claim.updateMany({ where: { invoiceId: id }, data: { status: "cancelled" } });
  },

  pendingVoidRequest(invoiceId: string, tx: TransactionClient = prisma) {
    return tx.invoiceVoidRequest.findFirst({ where: { invoiceId, status: "pending" }, select: { id: true, reason: true } });
  },

  findVoidRequest(clinicId: string, id: string, tx: TransactionClient) {
    return tx.invoiceVoidRequest.findFirst({ where: { id, clinicId }, select: { id: true, invoiceId: true, reason: true, status: true } });
  },

  createVoidRequest(data: { clinicId: string; invoiceId: string; requestedById: string; reason: string }, tx: TransactionClient) {
    return tx.invoiceVoidRequest.create({ data, select: { id: true } });
  },

  decideVoidRequests(invoiceId: string, status: "approved" | "declined", decidedById: string, tx: TransactionClient) {
    return tx.invoiceVoidRequest.updateMany({ where: { invoiceId, status: "pending" }, data: { status, decidedById, decidedAt: new Date() } });
  },

  async collected(clinicId: string, from: Date, to: Date) {
    const result = await prisma.payment.aggregate({ where: { clinicId, status: POSTED, receivedAt: { gte: from, lt: to } }, _sum: { amount: true } });
    return result._sum.amount?.toNumber() ?? 0;
  },

  async unpaid(clinicId: string) {
    const rows = await prisma.invoice.findMany({ where: unpaidWhere(clinicId), select: summarySelect, orderBy: { issuedAt: "asc" } });
    return rows.map(toSummary).filter((i) => i.balance > 0);
  },

  async hmoPending(clinicId: string) {
    const result = await prisma.claim.aggregate({ where: { clinicId, status: "submitted" }, _sum: { approvedAmount: true } });
    return result._sum.approvedAmount?.toNumber() ?? 0;
  },

  latestPayments(clinicId: string) {
    return prisma.payment.findMany({
      where: { clinicId },
      orderBy: { receivedAt: "desc" },
      take: LATEST_PAYMENTS,
      select: {
        id: true,
        amount: true,
        method: true,
        reference: true,
        receivedAt: true,
        status: true,
        recordedBy: { select: { fullName: true } },
        patient: { select: { contact: { select: { fullName: true } } } },
        paymentAllocations: { take: 1, select: { invoice: { select: { id: true, number: true } } } },
      },
    });
  },

  pendingVoids(clinicId: string) {
    return prisma.invoiceVoidRequest.findMany({
      where: { clinicId, status: "pending" },
      orderBy: { createdAt: "asc" },
      select: { id: true, reason: true, createdAt: true, requestedBy: { select: { fullName: true } }, invoice: { select: summarySelect } },
    });
  },

  /** Billed (non-cancelled) total and what the patient still owes. */
  async patientTotals(clinicId: string, patientId: string) {
    const rows = await prisma.invoice.findMany({ where: { clinicId, patientId, status: { not: "void" } }, select: summarySelect });
    const summaries = rows.map(toSummary);
    return { totalBilled: round2(summaries.reduce((s, i) => s + i.total, 0)), balance: round2(summaries.reduce((s, i) => s + i.balance, 0)) };
  },
};

export type InvoiceDetailRow = NonNullable<Awaited<ReturnType<typeof billingRepository.findDetail>>>;
