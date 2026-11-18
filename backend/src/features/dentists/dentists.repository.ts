import "server-only";
import type { RecordScope } from "@backend/lib/authorization";
import { prisma } from "@backend/lib/prisma";

export const dentistsRepository = {
  /** Active dentists of the clinic; a scoped dentist only gets themselves. */
  list(scope: RecordScope) {
    return prisma.user.findMany({
      where: { clinicId: scope.clinicId, status: "active", userRoles: { some: { role: { code: "DENTIST" } } }, ...(scope.assigneeId ? { id: scope.assigneeId } : {}) },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    });
  },

  assignedCounts(clinicId: string, dentistIds: string[]) {
    return prisma.patient.groupBy({ by: ["primaryDentistId"], where: { clinicId, primaryDentistId: { in: dentistIds } }, _count: true });
  },

  /** Patients filed under one dentist, newest first. */
  recentAssigned(clinicId: string, dentistId: string, take: number) {
    return prisma.patient.findMany({
      where: { clinicId, primaryDentistId: dentistId },
      select: { id: true, patientNo: true, contact: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
      take,
    });
  },
};
