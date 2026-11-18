import "server-only";
import { Prisma } from "@backend/generated/prisma/client";
import { prisma, type TransactionClient } from "@backend/lib/prisma";
import type { ClaimFilter } from "./claims.types";

export const CLAIMS_LIMIT = 200;

const claimSelect = {
  id: true,
  status: true,
  loaNo: true,
  approvedAmount: true,
  paidAmount: true,
  paidAt: true,
  paymentRef: true,
  deniedReason: true,
  submittedAt: true,
  payer: { select: { name: true } },
  invoice: { select: { id: true, number: true, hmoDue: true, patient: { select: { patientNo: true, contact: { select: { fullName: true } } } } } },
} satisfies Prisma.ClaimSelect;

export type ClaimRecord = Prisma.ClaimGetPayload<{ select: typeof claimSelect }>;

const sumOf = (value: Prisma.Decimal | null) => value?.toNumber() ?? 0;

export const claimsRepository = {
  async list(clinicId: string, status: ClaimFilter) {
    const rows = await prisma.claim.findMany({
      where: { clinicId, ...(status === "all" ? {} : { status }) },
      select: claimSelect,
      orderBy: [{ submittedAt: "desc" }, { id: "asc" }],
      take: CLAIMS_LIMIT + 1,
    });
    return { rows: rows.slice(0, CLAIMS_LIMIT), truncated: rows.length > CLAIMS_LIMIT };
  },

  statusCounts(clinicId: string) {
    return prisma.claim.groupBy({ by: ["status"], where: { clinicId }, _count: true });
  },

  async totals(clinicId: string, monthStart: Date) {
    const [submitted, approved, paid] = await Promise.all([
      prisma.claim.aggregate({ where: { clinicId, status: "submitted" }, _sum: { approvedAmount: true } }),
      prisma.claim.aggregate({ where: { clinicId, status: "approved" }, _sum: { approvedAmount: true } }),
      prisma.claim.aggregate({ where: { clinicId, status: "paid", paidAt: { gte: monthStart } }, _sum: { paidAmount: true } }),
    ]);
    return { awaitingApproval: sumOf(submitted._sum.approvedAmount), approvedUnpaid: sumOf(approved._sum.approvedAmount), paidThisMonth: sumOf(paid._sum.paidAmount) };
  },

  /** Locks the claim row so two people can't move it at once. */
  async findForUpdate(clinicId: string, id: string, tx: TransactionClient) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM claims WHERE id = ${id} FOR UPDATE`);
    return tx.claim.findFirst({ where: { id, clinicId }, select: claimSelect });
  },

  update(id: string, data: Prisma.ClaimUncheckedUpdateInput, tx: TransactionClient) {
    return tx.claim.update({ where: { id }, data, select: claimSelect });
  },
};
