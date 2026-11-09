import "server-only";
import type { Prisma } from "@backend/generated/prisma/client";
import { prisma, type TransactionClient } from "@backend/lib/prisma";

export const settingsRepository = {
  findClinicSettings(clinicId: string, tx: TransactionClient = prisma) {
    return tx.clinic.findUnique({ where: { id: clinicId }, select: { settings: true } });
  },

  updateClinicSettings(clinicId: string, settings: Prisma.InputJsonValue, tx: TransactionClient) {
    return tx.clinic.update({ where: { id: clinicId }, data: { settings }, select: { settings: true } });
  },
};
