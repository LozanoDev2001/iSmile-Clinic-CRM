import "server-only";
import type { Prisma } from "@backend/generated/prisma/client";
import { prisma, type TransactionClient } from "@backend/lib/prisma";

export const settingsRepository = {
  findClinicSettings(clinicId: string, tx: TransactionClient = prisma) {
    return tx.clinic.findUnique({ where: { id: clinicId }, select: { name: true, settings: true } });
  },

  updateClinicSettings(clinicId: string, settings: Prisma.InputJsonValue, tx: TransactionClient) {
    return tx.clinic.update({ where: { id: clinicId }, data: { settings }, select: { settings: true } });
  },

  updateClinicProfile(clinicId: string, data: { name: string; settings: Prisma.InputJsonValue }, tx: TransactionClient) {
    return tx.clinic.update({ where: { id: clinicId }, data, select: { id: true } });
  },
};
