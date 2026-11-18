import "server-only";
import { prisma } from "@backend/lib/prisma";

export const billingAuditRepository = {
  /** Newest first by id, which also orders by write time. */
  list(clinicId: string, actions: string[], before: bigint | undefined, take: number) {
    return prisma.auditLog.findMany({
      where: { clinicId, action: { in: actions }, ...(before ? { id: { lt: before } } : {}) },
      orderBy: { id: "desc" },
      take,
      select: { id: true, occurredAt: true, action: true, entityType: true, entityId: true, afterData: true, actor: { select: { fullName: true } } },
    });
  },
};
