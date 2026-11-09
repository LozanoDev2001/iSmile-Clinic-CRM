import "server-only";
import type { Prisma } from "@backend/generated/prisma/client";
import type { RecordScope } from "@backend/lib/authorization";
import { prisma } from "@backend/lib/prisma";
import type { ListPatientsQuery, PatientMedicalDetail, PatientSummary } from "./patients.types";

/** Translates the user's RecordScope into a Prisma filter. Applied to EVERY query. */
function scopeWhere(scope: RecordScope): Prisma.PatientWhereInput {
  return {
    clinicId: scope.clinicId,
    ...(scope.assigneeId ? { primaryDentistId: scope.assigneeId } : {}),
  };
}

const summarySelect = {
  id: true,
  clinicId: true,
  patientNo: true,
  primaryDentistId: true,
  status: true,
  createdAt: true,
  contact: { select: { fullName: true, phone: true, email: true } },
} satisfies Prisma.PatientSelect;

const medicalSelect = { ...summarySelect, dob: true, sex: true, medicalAlerts: true } satisfies Prisma.PatientSelect;

type SummaryRow = Prisma.PatientGetPayload<{ select: typeof summarySelect }>;

function toSummary({ contact, ...patient }: SummaryRow): PatientSummary {
  return { ...patient, fullName: contact.fullName, phone: contact.phone, email: contact.email };
}

export const patientsRepository = {
  async list(scope: RecordScope, query: ListPatientsQuery) {
    const where: Prisma.PatientWhereInput = {
      AND: [
        scopeWhere(scope),
        query.search
          ? {
              OR: [
                { patientNo: { startsWith: query.search } },
                { contact: { fullName: { startsWith: query.search } } },
                { contact: { phone: { startsWith: query.search } } },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await prisma.$transaction([
      prisma.patient.findMany({
        where,
        select: summarySelect,
        orderBy: { contact: { fullName: "asc" } },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.patient.count({ where }),
    ]);
    return { items: rows.map(toSummary), total };
  },

  /** Scoped totals: all patients, and those created on or after `since`. */
  counts(scope: RecordScope, since: Date) {
    const where = scopeWhere(scope);
    return prisma.$transaction([
      prisma.patient.count({ where }),
      prisma.patient.count({ where: { AND: [where, { createdAt: { gte: since } }] } }),
    ]);
  },

  /** Scoped lookup: a patient outside the scope is indistinguishable from a missing one. */
  async findById(scope: RecordScope, id: string, { includeMedical }: { includeMedical: boolean }): Promise<PatientSummary | PatientMedicalDetail | null> {
    const where = { AND: [scopeWhere(scope), { id }] };
    if (!includeMedical) {
      const row = await prisma.patient.findFirst({ where, select: summarySelect });
      return row && toSummary(row);
    }
    const row = await prisma.patient.findFirst({ where, select: medicalSelect });
    if (!row) return null;
    const { dob, sex, medicalAlerts, ...summary } = row;
    return { ...toSummary(summary), dob, sex, medicalAlerts };
  },
};
