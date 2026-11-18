import "server-only";
import { prisma, type TransactionClient } from "@backend/lib/prisma";

/** Claims sent to an HMO and not yet paid or denied. */
const OPEN_CLAIM_STATUSES = ["submitted", "approved"];

export const billingReportsRepository = {
  paymentsByMethod(clinicId: string, from: Date, to: Date) {
    return prisma.payment.groupBy({
      by: ["method"],
      where: { clinicId, status: "posted", receivedAt: { gte: from, lt: to } },
      _sum: { amount: true },
      _count: true,
    });
  },

  hmoPaid(clinicId: string, from: Date, to: Date) {
    return prisma.claim.aggregate({ where: { clinicId, status: "paid", paidAt: { gte: from, lt: to } }, _sum: { paidAmount: true }, _count: true });
  },

  openClaims(clinicId: string) {
    return prisma.claim.findMany({
      where: { clinicId, status: { in: OPEN_CLAIM_STATUSES } },
      select: {
        id: true,
        submittedAt: true,
        approvedAmount: true,
        payer: { select: { name: true } },
        invoice: { select: { id: true, number: true, patient: { select: { contact: { select: { fullName: true } } } } } },
      },
      orderBy: { submittedAt: "asc" },
    });
  },

  /** Non-cancelled invoices issued in [from, to) with their lines and the dentist who saw the patient. */
  revenueInvoices(clinicId: string, from: Date, to: Date) {
    return prisma.invoice.findMany({
      where: { clinicId, status: { not: "void" }, issuedAt: { gte: from, lt: to } },
      select: {
        appointment: { select: { dentist: { select: { fullName: true } } } },
        invoiceItems: { select: { description: true, qty: true, lineTotal: true, discount: true } },
      },
    });
  },

  billedTotals(clinicId: string, from: Date, to: Date) {
    return prisma.invoice.aggregate({ where: { clinicId, status: { not: "void" }, issuedAt: { gte: from, lt: to } }, _sum: { grandTotal: true, taxTotal: true } });
  },

  expensesByCategory(clinicId: string, from: Date, to: Date) {
    return prisma.expenseEntry.groupBy({ by: ["category"], where: { clinicId, incurredOn: { gte: from, lt: to } }, _sum: { amount: true } });
  },

  expenses(clinicId: string, from: Date, to: Date) {
    return prisma.expenseEntry.findMany({
      where: { clinicId, incurredOn: { gte: from, lt: to } },
      select: { id: true, category: true, amount: true, incurredOn: true, description: true },
      orderBy: [{ incurredOn: "desc" }, { id: "asc" }],
    });
  },

  createExpense(data: { clinicId: string; category: string; amount: number; incurredOn: Date; description: string | null }, tx: TransactionClient) {
    return tx.expenseEntry.create({ data, select: { id: true } });
  },

  findExpense(clinicId: string, id: string, tx: TransactionClient) {
    return tx.expenseEntry.findFirst({ where: { id, clinicId }, select: { id: true, category: true, amount: true } });
  },

  deleteExpense(id: string, tx: TransactionClient) {
    return tx.expenseEntry.delete({ where: { id } });
  },
};
