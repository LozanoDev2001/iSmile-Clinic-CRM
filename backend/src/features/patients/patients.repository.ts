import "server-only";
import type { Prisma } from "@backend/generated/prisma/client";
import type { RecordScope } from "@backend/lib/authorization";
import { prisma } from "@backend/lib/prisma";
import type { ListPatientsQuery } from "./patients.types";

/** Translates the user's RecordScope into a Prisma filter. Applied to EVERY query. */
function scopeWhere(scope: RecordScope): Prisma.PatientWhereInput {
  return {
    ...(scope.clinicId ? { clinicId: scope.clinicId } : {}),
    ...(scope.branchIds ? { branchId: { in: scope.branchIds } } : {}),
    ...(scope.assigneeId ? { primaryDentistId: scope.assigneeId } : {}),
  };
}

const summarySelect = {
  id: true,
  clinicId: true,
  branchId: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  primaryDentistId: true,
  updatedAt: true,
} satisfies Prisma.PatientSelect;

const medicalSelect = {
  ...summarySelect,
  dateOfBirth: true,
  medicalNotes: true,
  allergies: true,
} satisfies Prisma.PatientSelect;

export const patientsRepository = {
  async list(scope: RecordScope, query: ListPatientsQuery) {
    const where: Prisma.PatientWhereInput = {
      AND: [
        scopeWhere(scope),
        query.branchId ? { branchId: query.branchId } : {},
        query.search
          ? {
              OR: [
                { lastName: { startsWith: query.search } },
                { firstName: { startsWith: query.search } },
                { phone: { startsWith: query.search } },
              ],
            }
          : {},
      ],
    };
    const [items, total] = await prisma.$transaction([
      prisma.patient.findMany({
        where,
        select: summarySelect,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.patient.count({ where }),
    ]);
    return { items, total };
  },

  /** Scoped lookup: a patient outside the scope is indistinguishable from a missing one. */
  findById(scope: RecordScope, id: string, { includeMedical }: { includeMedical: boolean }) {
    return prisma.patient.findFirst({
      where: { AND: [scopeWhere(scope), { id }] },
      select: includeMedical ? medicalSelect : summarySelect,
    });
  },
};
