import "server-only";
import { Prisma } from "@backend/generated/prisma/client";
import { prisma, type TransactionClient } from "@backend/lib/prisma";
import { NON_CASH_METHODS } from "./bank.schema";

const POSTED = "posted";
const RECENT_DEPOSITS = 50;
const UNSEEN_LIMIT = 100;

export const matchablePaymentSelect = {
  id: true,
  amount: true,
  method: true,
  reference: true,
  receivedAt: true,
  patient: { select: { contact: { select: { fullName: true } } } },
  paymentAllocations: { take: 1, select: { invoice: { select: { id: true, number: true } } } },
} satisfies Prisma.PaymentSelect;

export type MatchablePaymentRow = Prisma.PaymentGetPayload<{ select: typeof matchablePaymentSelect }>;

const unmatchedPaymentWhere = (clinicId: string): Prisma.PaymentWhereInput => ({
  clinicId,
  status: POSTED,
  method: { in: [...NON_CASH_METHODS] },
  bankTransactions: { none: {} },
});

export const bankRepository = {
  methodTotals(clinicId: string, from: Date, to: Date) {
    return prisma.payment.groupBy({ by: ["method"], where: { clinicId, status: POSTED, receivedAt: { gte: from, lt: to } }, _sum: { amount: true }, _count: true });
  },

  accounts(clinicId: string) {
    return prisma.bankAccount.findMany({
      where: { clinicId },
      select: { id: true, label: true, lastFour: true, _count: { select: { bankTransactions: true } } },
      orderBy: { label: "asc" },
    });
  },

  createAccount(data: { clinicId: string; label: string; lastFour: string | null }, tx: TransactionClient) {
    return tx.bankAccount.create({ data, select: { id: true } });
  },

  accountExists(clinicId: string, id: string, tx: TransactionClient) {
    return tx.bankAccount.count({ where: { id, clinicId } });
  },

  createDeposit(data: { bankAccountId: string; postedOn: Date; amount: number; reference: string | null; description: string | null }, tx: TransactionClient) {
    return tx.bankTransaction.create({ data, select: { id: true } });
  },

  /** Deposits are scoped through their account: bank_transactions has no clinic_id. */
  recentDeposits(clinicId: string) {
    return prisma.bankTransaction.findMany({
      where: { bankAccount: { clinicId } },
      orderBy: [{ postedOn: "desc" }, { createdAt: "desc" }],
      take: RECENT_DEPOSITS,
      select: {
        id: true,
        postedOn: true,
        amount: true,
        reference: true,
        description: true,
        bankAccount: { select: { id: true, label: true, lastFour: true } },
        matchedPayment: { select: matchablePaymentSelect },
      },
    });
  },

  async unmatchedDepositTotals(clinicId: string) {
    const result = await prisma.bankTransaction.aggregate({ where: { bankAccount: { clinicId }, matchedPaymentId: null }, _sum: { amount: true }, _count: true });
    return { count: result._count, amount: result._sum.amount?.toNumber() ?? 0 };
  },

  unseenPayments(clinicId: string) {
    return prisma.payment.findMany({ where: unmatchedPaymentWhere(clinicId), select: matchablePaymentSelect, orderBy: { receivedAt: "desc" }, take: UNSEEN_LIMIT });
  },

  /** Locks the deposit row and returns it if it belongs to the clinic. */
  async lockDeposit(clinicId: string, id: string, tx: TransactionClient) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM bank_transactions WHERE id = ${id} FOR UPDATE`);
    return tx.bankTransaction.findFirst({ where: { id, bankAccount: { clinicId } }, select: { id: true, amount: true, matchedPaymentId: true } });
  },

  /** Locks the payment row and returns it if it is a posted non-cash payment of the clinic with no deposit matched yet. */
  async lockMatchablePayment(clinicId: string, id: string, tx: TransactionClient) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM payments WHERE id = ${id} FOR UPDATE`);
    return tx.payment.findFirst({ where: { id, ...unmatchedPaymentWhere(clinicId) }, select: { id: true, amount: true } });
  },

  setMatch(id: string, matchedPaymentId: string | null, tx: TransactionClient) {
    return tx.bankTransaction.update({ where: { id }, data: { matchedPaymentId } });
  },
};
