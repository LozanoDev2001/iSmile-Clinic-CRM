import "server-only";
import { prisma, type TransactionClient } from "@backend/lib/prisma";
import type { TaxType } from "./catalog.types";

const SERVICE_SELECT = { id: true, code: true, name: true, price: true, taxType: true, hmoCoverable: true } as const;

interface ServiceData {
  name: string;
  price: number;
  taxType: TaxType;
  hmoCoverable: boolean;
}

export const catalogRepository = {
  listActive(clinicId: string) {
    return prisma.service.findMany({
      where: { clinicId, active: true },
      select: SERVICE_SELECT,
      orderBy: [{ taxType: "asc" }, { name: "asc" }],
    });
  },

  /** Active services with their usual length, for booking appointments. */
  listBookable(clinicId: string) {
    return prisma.service.findMany({
      where: { clinicId, active: true, taxType: "exempt" },
      select: { id: true, name: true, durationMinutes: true },
      orderBy: { name: "asc" },
    });
  },

  findActive(clinicId: string, id: string, tx: TransactionClient = prisma) {
    return tx.service.findFirst({ where: { id, clinicId, active: true }, select: SERVICE_SELECT });
  },

  /** Case-insensitive under the default MySQL collation. */
  nameTaken(clinicId: string, name: string, excludeId: string | undefined, tx: TransactionClient) {
    return tx.service.count({ where: { clinicId, active: true, name, ...(excludeId ? { id: { not: excludeId } } : {}) } });
  },

  create(clinicId: string, code: string, data: ServiceData, tx: TransactionClient) {
    return tx.service.create({ data: { clinicId, code, ...data }, select: SERVICE_SELECT });
  },

  update(id: string, data: ServiceData, tx: TransactionClient) {
    return tx.service.update({ where: { id }, data, select: SERVICE_SELECT });
  },

  archive(id: string, tx: TransactionClient) {
    return tx.service.update({ where: { id }, data: { active: false }, select: { id: true } });
  },
};
