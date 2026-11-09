import "server-only";
import { prisma, type TransactionClient } from "@backend/lib/prisma";

export const staffRepository = {
  /** Active staff with their role grants and overrides, to work out what each can do. */
  activeWithAccess(clinicId: string, tx: TransactionClient = prisma) {
    return tx.user.findMany({
      where: { clinicId, status: "active" },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        userRoles: { take: 1, select: { role: { select: { code: true, rolePermissions: { select: { permission: { select: { resource: true, action: true } } } } } } } },
        userPermissionOverrides: { select: { decision: true, permission: { select: { resource: true, action: true } } } },
      },
    });
  },
};
