import "server-only";
import { Prisma } from "@backend/generated/prisma/client";
import type { RecordScope } from "@backend/lib/authorization";
import { prisma, type TransactionClient } from "@backend/lib/prisma";
import type { ListPatientsQuery, PatientClinicalData, PatientData, PatientFilter, PatientMedicalDetail, PatientSummary } from "./patients.types";

const KID_MAX_AGE = 12;
const SENIOR_MIN_AGE = 60;
const UPCOMING_LIMIT = 5;
const VISIT_LIMIT = 50;

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
  dob: true,
  sex: true,
  primaryDentistId: true,
  status: true,
  createdAt: true,
  contact: { select: { fullName: true, phone: true, email: true } },
} satisfies Prisma.PatientSelect;

type SummaryRow = Prisma.PatientGetPayload<{ select: typeof summarySelect }>;

/** DATE columns come back as UTC midnight; keep them as plain calendar dates. */
export const toDateString = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const fromDateString = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);

function toSummary({ contact, dob, ...patient }: SummaryRow): PatientSummary {
  return { ...patient, dob: toDateString(dob), fullName: contact.fullName, phone: contact.phone, email: contact.email };
}

/** The date `years` before `today` (YYYY-MM-DD). */
function yearsBefore(today: string, years: number) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
}

async function filterWhere(scope: RecordScope, filter: PatientFilter, today: string): Promise<Prisma.PatientWhereInput> {
  switch (filter) {
    case "kids":
      return { dob: { gt: yearsBefore(today, KID_MAX_AGE + 1) } };
    case "seniors":
      return { OR: [{ scPwdId: { not: null } }, { dob: { lte: yearsBefore(today, SENIOR_MIN_AGE) } }] };
    case "birthdays": {
      // Prisma has no MONTH() filter, so match birth months with a parameterised query.
      const month = Number(today.slice(5, 7));
      const rows = await prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM patients WHERE clinic_id = ${scope.clinicId} AND MONTH(dob) = ${month}${
          scope.assigneeId ? Prisma.sql` AND primary_dentist_id = ${scope.assigneeId}` : Prisma.empty
        }`,
      );
      return { id: { in: rows.map((r) => r.id) } };
    }
    default:
      return {};
  }
}

function searchWhere(search: string | undefined): Prisma.PatientWhereInput {
  if (!search) return {};
  return {
    OR: [
      { patientNo: { startsWith: search } },
      { contact: { fullName: { contains: search } } },
      { contact: { phone: { contains: search } } },
    ],
  };
}

const fileSelect = (includeMedical: boolean, now: Date) =>
  ({
    ...summarySelect,
    civilStatus: true,
    occupation: true,
    hmoMemberNo: true,
    scPwdId: true,
    medicalAlerts: includeMedical,
    medicalConditions: includeMedical,
    medications: includeMedical,
    contact: { select: { fullName: true, phone: true, email: true, address: true, preferredChannel: true } },
    primaryDentist: { select: { id: true, fullName: true } },
    payer: { select: { id: true, name: true } },
    patientGuardians: {
      where: { isPrimary: true },
      take: 1,
      select: { relationship: true, guardianContact: { select: { fullName: true, phone: true } } },
    },
    appointments: {
      where: { startsAt: { gte: now }, status: { notIn: ["cancelled", "no_show"] } },
      orderBy: { startsAt: "asc" },
      take: UPCOMING_LIMIT,
      select: { id: true, startsAt: true, status: true, service: { select: { name: true } }, dentist: { select: { fullName: true } } },
    },
  }) satisfies Prisma.PatientSelect;

/** Contact, patient and emergency-contact fields, split for the three tables they live in. */
function splitData(data: PatientData) {
  const { fullName, phone, email, address, preferredChannel, emergencyName, emergencyRelationship, emergencyPhone, dob, ...patient } = data;
  return {
    contact: { fullName, phone, email, address, preferredChannel },
    patient: { ...patient, dob: fromDateString(dob) },
    emergency: emergencyName ? { fullName: emergencyName, phone: emergencyPhone, relationship: emergencyRelationship } : null,
  };
}

const clinicalColumns = (c: PatientClinicalData) => ({ medicalAlerts: c.allergies, medicalConditions: c.medicalConditions, medications: c.medications });

async function replaceEmergencyContact(clinicId: string, patientId: string, emergency: ReturnType<typeof splitData>["emergency"], tx: TransactionClient) {
  const current = await tx.patientGuardian.findFirst({ where: { patientId, isPrimary: true }, select: { guardianContactId: true } });
  if (current && emergency) {
    await tx.contact.update({ where: { id: current.guardianContactId }, data: { fullName: emergency.fullName, phone: emergency.phone } });
    await tx.patientGuardian.update({
      where: { patientId_guardianContactId: { patientId, guardianContactId: current.guardianContactId } },
      data: { relationship: emergency.relationship },
    });
    return;
  }
  if (current) {
    // The contact row stays: it may be linked to other patients or conversations.
    await tx.patientGuardian.delete({ where: { patientId_guardianContactId: { patientId, guardianContactId: current.guardianContactId } } });
    return;
  }
  if (emergency) {
    const contact = await tx.contact.create({
      data: { clinicId, contactType: "guardian", fullName: emergency.fullName, phone: emergency.phone },
      select: { id: true },
    });
    await tx.patientGuardian.create({ data: { patientId, guardianContactId: contact.id, relationship: emergency.relationship, isPrimary: true } });
  }
}

export const patientsRepository = {
  async list(scope: RecordScope, query: ListPatientsQuery, today: string) {
    const where: Prisma.PatientWhereInput = {
      AND: [scopeWhere(scope), searchWhere(query.search), await filterWhere(scope, query.filter, today)],
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

  /** How many patients each list filter would show, within the user's scope. */
  async filterCounts(scope: RecordScope, filters: readonly PatientFilter[], today: string) {
    const counts = await Promise.all(
      filters.map(async (f) => prisma.patient.count({ where: { AND: [scopeWhere(scope), await filterWhere(scope, f, today)] } })),
    );
    return Object.fromEntries(filters.map((f, i) => [f, counts[i]])) as Record<PatientFilter, number>;
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
    const row = await prisma.patient.findFirst({ where, select: { ...summarySelect, medicalAlerts: true } });
    if (!row) return null;
    const { medicalAlerts, ...summary } = row;
    return { ...toSummary(summary), medicalAlerts };
  },

  findFile(scope: RecordScope, id: string, includeMedical: boolean, now: Date) {
    return prisma.patient.findFirst({ where: { AND: [scopeWhere(scope), { id }] }, select: fileSelect(includeMedical, now) });
  },

  /** Visits with their procedures, and every charted treatment item. Call only after a scoped lookup of the patient. */
  treatmentHistory(patientId: string) {
    return prisma.$transaction([
      prisma.encounter.findMany({
        where: { patientId },
        orderBy: { occurredAt: "desc" },
        take: VISIT_LIMIT,
        select: {
          id: true,
          occurredAt: true,
          dentist: { select: { fullName: true } },
          treatmentItems: { select: { toothCode: true, service: { select: { name: true } } } },
        },
      }),
      prisma.treatmentItem.findMany({
        where: { plan: { patientId }, toothCode: { not: null } },
        select: { toothCode: true, encounterId: true, service: { select: { name: true } } },
      }),
    ]);
  },

  exists(scope: RecordScope, id: string, tx: TransactionClient) {
    return tx.patient.findFirst({ where: { AND: [scopeWhere(scope), { id }] }, select: { id: true, contactId: true, payerId: true } });
  },

  async create(clinicId: string, patientNo: string, data: PatientData, clinical: PatientClinicalData | null, tx: TransactionClient) {
    const { contact, patient, emergency } = splitData(data);
    const { id: contactId } = await tx.contact.create({ data: { clinicId, contactType: "patient", ...contact }, select: { id: true } });
    const created = await tx.patient.create({
      data: { clinicId, contactId, patientNo, ...patient, ...(clinical ? clinicalColumns(clinical) : {}) },
      select: { id: true },
    });
    await replaceEmergencyContact(clinicId, created.id, emergency, tx);
    return created;
  },

  async update(clinicId: string, ids: { id: string; contactId: string }, data: PatientData, clinical: PatientClinicalData | null, tx: TransactionClient) {
    const { contact, patient, emergency } = splitData(data);
    await tx.contact.update({ where: { id: ids.contactId }, data: contact });
    await tx.patient.update({ where: { id: ids.id }, data: { ...patient, ...(clinical ? clinicalColumns(clinical) : {}) } });
    await replaceEmergencyContact(clinicId, ids.id, emergency, tx);
  },

  /** Highest number used in the clinic's P-0001, P-0002, … patient numbers (0 if none). */
  async maxPatientNumber(clinicId: string, tx: TransactionClient) {
    const [row] = await tx.$queryRaw<{ n: bigint | number | null }[]>(
      Prisma.sql`SELECT MAX(CAST(SUBSTRING(patient_no, 3) AS UNSIGNED)) AS n FROM patients WHERE clinic_id = ${clinicId} AND patient_no LIKE 'P-%'`,
    );
    return Number(row?.n ?? 0);
  },

  isClinicDentist(clinicId: string, userId: string, tx: TransactionClient) {
    return tx.user.count({ where: { id: userId, clinicId, status: "active", userRoles: { some: { role: { code: "DENTIST" } } } } });
  },

  isClinicHmo(clinicId: string, payerId: string, tx: TransactionClient) {
    return tx.payer.count({ where: { id: payerId, clinicId, payerType: "hmo" } });
  },

  formOptions(clinicId: string) {
    return Promise.all([
      prisma.user.findMany({
        where: { clinicId, status: "active", userRoles: { some: { role: { code: "DENTIST" } } } },
        select: { id: true, fullName: true },
        orderBy: { fullName: "asc" },
      }),
      prisma.payer.findMany({ where: { clinicId, payerType: "hmo" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
  },
};
