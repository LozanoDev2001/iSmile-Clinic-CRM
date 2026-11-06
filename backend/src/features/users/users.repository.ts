import "server-only";
import type { Role } from "@backend/generated/prisma/enums";
import { prisma, type TransactionClient } from "@backend/lib/prisma";

/** Public-safe user fields. Never add `passwordHash` here. */
export const userListSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  clinicId: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  passwordHash: false,
} as const;

export const usersRepository = {
  list(clinicId: string | undefined, { skip, take }: { skip: number; take: number }) {
    const where = clinicId ? { clinicId } : {};
    return prisma.$transaction([
      prisma.user.findMany({ where, select: userListSelect, orderBy: { name: "asc" }, skip, take }),
      prisma.user.count({ where }),
    ]);
  },

  listBranches(clinicId: string | undefined) {
    return prisma.branch.findMany({
      where: { isActive: true, ...(clinicId ? { clinicId } : {}) },
      select: { id: true, name: true, clinicId: true },
      orderBy: { name: "asc" },
    });
  },

  listClinics() {
    return prisma.clinic.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  },

  findForAdmin(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, clinicId: true, isActive: true },
    });
  },

  countBranchesInClinic(clinicId: string, branchIds: string[]) {
    return prisma.branch.count({ where: { clinicId, id: { in: branchIds }, isActive: true } });
  },

  create(
    data: { name: string; email: string; role: Role; clinicId: string | null; branchIds: string[] },
    tx: TransactionClient,
  ) {
    return tx.user.create({
      data: {
        name: data.name,
        email: data.email,
        role: data.role,
        clinicId: data.clinicId,
        branches: { create: data.branchIds.map((branchId) => ({ branchId })) },
      },
      select: userListSelect,
    });
  },

  /** Deactivation also revokes every session immediately. */
  setActive(id: string, isActive: boolean, tx: TransactionClient) {
    return tx.user.update({
      where: { id },
      data: { isActive, ...(isActive ? {} : { sessionVersion: { increment: 1 } }) },
      select: userListSelect,
    });
  },
};
