import "server-only";
import type { Prisma } from "@backend/generated/prisma/client";
import { prisma, type TransactionClient } from "@backend/lib/prisma";

const LIST_LIMIT = 200;

export const planSelect = {
  id: true,
  status: true,
  createdAt: true,
  invoiceId: true,
  patient: { select: { id: true, patientNo: true, contact: { select: { fullName: true } } } },
  invoice: { select: { id: true, number: true } },
  paymentInstallments: { select: { id: true, dueOn: true, amount: true, status: true, paidAt: true }, orderBy: { dueOn: "asc" } },
} satisfies Prisma.PaymentPlanSelect;

export type PlanRow = Prisma.PaymentPlanGetPayload<{ select: typeof planSelect }>;

export const plansRepository = {
  list(clinicId: string) {
    return prisma.paymentPlan.findMany({ where: { clinicId }, select: planSelect, orderBy: { createdAt: "desc" }, take: LIST_LIMIT });
  },

  find(clinicId: string, id: string, tx: TransactionClient = prisma) {
    return tx.paymentPlan.findFirst({ where: { id, clinicId }, select: planSelect });
  },

  /** Invoice ids that already have an active plan. */
  async activeInvoiceIds(clinicId: string) {
    const rows = await prisma.paymentPlan.findMany({ where: { clinicId, status: "active", invoiceId: { not: null } }, select: { invoiceId: true } });
    return new Set(rows.map((r) => r.invoiceId));
  },

  activeForInvoice(invoiceId: string, tx: TransactionClient) {
    return tx.paymentPlan.findFirst({ where: { invoiceId, status: "active" }, select: { id: true } });
  },

  create(data: { clinicId: string; patientId: string; invoiceId: string; installments: { dueOn: Date; amount: number }[] }, tx: TransactionClient) {
    return tx.paymentPlan.create({
      data: { clinicId: data.clinicId, patientId: data.patientId, invoiceId: data.invoiceId, status: "active", paymentInstallments: { create: data.installments } },
      select: { id: true },
    });
  },

  findInstallment(clinicId: string, id: string, tx: TransactionClient) {
    return tx.paymentInstallment.findFirst({ where: { id, plan: { clinicId } }, select: { id: true, planId: true, plan: { select: { invoiceId: true } } } });
  },

  markPaid(id: string, paymentId: string, tx: TransactionClient) {
    return tx.paymentInstallment.update({ where: { id }, data: { status: "paid", paymentId, paidAt: new Date() } });
  },

  setStatus(id: string, status: "active" | "completed" | "cancelled", tx: TransactionClient) {
    return tx.paymentPlan.update({ where: { id }, data: { status } });
  },

  cancelRemaining(planId: string, tx: TransactionClient) {
    return tx.paymentInstallment.updateMany({ where: { planId, status: "due" }, data: { status: "cancelled" } });
  },
};
