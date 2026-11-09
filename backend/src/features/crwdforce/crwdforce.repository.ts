import "server-only";
import type { Prisma } from "@backend/generated/prisma/client";
import { prisma, type TransactionClient } from "@backend/lib/prisma";
import type { MiaDraft, MiaIntent, MiaNextStep } from "./crwdforce.types";

const draftSelect = {
  id: true,
  conversationId: true,
  reply: true,
  summary: true,
  intent: true,
  nextStep: true,
  slotLabel: true,
  handover: true,
  handoverReason: true,
  status: true,
  createdAt: true,
  createdBy: { select: { fullName: true } },
} satisfies Prisma.MiaDraftSelect;

type DraftRow = Prisma.MiaDraftGetPayload<{ select: typeof draftSelect }>;

export const toDraft = ({ createdBy, ...row }: DraftRow): MiaDraft => ({
  ...row,
  intent: row.intent as MiaIntent,
  nextStep: row.nextStep as MiaNextStep,
  status: row.status as MiaDraft["status"],
  createdBy: createdBy?.fullName ?? null,
});

export const crwdforceRepository = {
  create(data: Omit<Prisma.MiaDraftUncheckedCreateInput, "id" | "status" | "createdAt" | "decidedAt">, tx: TransactionClient = prisma) {
    return tx.miaDraft.create({ data, select: draftSelect });
  },

  /** The newest draft per conversation that is still waiting for a decision. */
  async pendingFor(clinicId: string, conversationIds: string[]) {
    if (!conversationIds.length) return [];
    const rows = await prisma.miaDraft.findMany({ where: { clinicId, status: "pending", conversationId: { in: conversationIds } }, select: draftSelect, orderBy: { createdAt: "desc" } });
    const newest = new Map<string, DraftRow>();
    for (const r of rows) if (!newest.has(r.conversationId)) newest.set(r.conversationId, r);
    return [...newest.values()].map(toDraft);
  },

  findPending(clinicId: string, id: string, tx: TransactionClient) {
    return tx.miaDraft.findFirst({ where: { id, clinicId, status: "pending" }, select: { id: true, conversationId: true } });
  },

  decide(id: string, status: "used" | "dismissed", tx: TransactionClient) {
    return tx.miaDraft.update({ where: { id }, data: { status, decidedAt: new Date() } });
  },

  draftsSince(clinicId: string, from: Date) {
    return prisma.miaDraft.findMany({ where: { clinicId, createdAt: { gte: from } }, select: { status: true, handover: true } });
  },
};
