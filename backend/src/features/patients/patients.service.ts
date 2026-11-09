import "server-only";
import { clinicToday } from "@backend/config/clinic";
import { Prisma } from "@backend/generated/prisma/client";
import { assertPermission, can, recordScope, type AuthUser } from "@backend/lib/authorization";
import { Errors } from "@backend/lib/errors/app-error";
import { AUDIT_ACTIONS, audit } from "@backend/lib/logging/audit";
import { prisma, type TransactionClient } from "@backend/lib/prisma";
import { PATIENT_FILTERS, listPatientsQuerySchema, patientClinicalSchema, patientIdSchema, patientInputSchema } from "./patient.schema";
import { patientsRepository, toDateString } from "./patients.repository";
import type {
  PatientClinicalData,
  PatientClinicalInput,
  PatientData,
  PatientDetail,
  PatientFile,
  PatientFilter,
  PatientFormOptions,
  PatientInput,
  PatientListResult,
  PatientStats,
  ToothCondition,
} from "./patients.types";

/**
 * Reference implementation of the access pattern every clinical module
 * should follow: permission check → validated input → scoped query →
 * field-level gating of sensitive data → audit of sensitive reads.
 */

export async function listPatients(user: AuthUser, rawQuery: unknown): Promise<PatientListResult> {
  assertPermission(user, "patients.read");
  const query = listPatientsQuerySchema.parse(rawQuery);
  const { items, total } = await patientsRepository.list(recordScope(user), query, clinicToday());
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getPatientFilterCounts(user: AuthUser): Promise<Record<PatientFilter, number>> {
  assertPermission(user, "patients.read");
  return patientsRepository.filterCounts(recordScope(user), PATIENT_FILTERS, clinicToday());
}

export async function getPatientStats(user: AuthUser, since: Date): Promise<PatientStats> {
  assertPermission(user, "patients.read");
  const [total, createdSince] = await patientsRepository.counts(recordScope(user), since);
  return { total, createdSince };
}

export async function getPatient(user: AuthUser, rawId: unknown): Promise<PatientDetail> {
  assertPermission(user, "patients.read");
  const id = patientIdSchema.parse(rawId);
  const includeMedical = can(user, "patients.medical.read");

  const patient = await patientsRepository.findById(recordScope(user), id, { includeMedical });
  if (!patient) throw Errors.notFound("patient");

  if (includeMedical) await auditMedicalView(user, patient.id, patient.clinicId);
  return patient;
}

/** Name and number only, for pickers; null when missing or out of scope. No clinical data, so no audit. */
export async function getPatientSummary(user: AuthUser, rawId: unknown) {
  assertPermission(user, "patients.read");
  const parsed = patientIdSchema.safeParse(rawId);
  if (!parsed.success) return null;
  return patientsRepository.findById(recordScope(user), parsed.data, { includeMedical: false });
}

async function auditMedicalView(user: AuthUser, patientId: string, clinicId: string) {
  await audit({ action: AUDIT_ACTIONS.PATIENT_MEDICAL_VIEWED, resourceType: "patient", resourceId: patientId, actorId: user.id, clinicId });
}

/** Tooth conditions from charted treatment items: done work wins, planned work shows until it is done. */
function chartFrom(items: { toothCode: string | null; encounterId: string | null; service: { name: string } }[]) {
  const chart: Record<string, ToothCondition> = {};
  const doneCondition = (name: string): ToothCondition => (/extraction/i.test(name) ? "extracted" : /crown/i.test(name) ? "crown" : "treated");
  for (const item of items) if (item.toothCode && item.encounterId) chart[item.toothCode] = doneCondition(item.service.name);
  for (const item of items) if (item.toothCode && !item.encounterId && !chart[item.toothCode]) chart[item.toothCode] = "planned";
  return chart;
}

export async function getPatientFile(user: AuthUser, rawId: unknown): Promise<PatientFile> {
  assertPermission(user, "patients.read");
  const id = patientIdSchema.parse(rawId);
  const includeMedical = can(user, "patients.medical.read");
  const includeTreatments = can(user, "treatments.read");

  const row = await patientsRepository.findFile(recordScope(user), id, includeMedical, new Date());
  if (!row) throw Errors.notFound("patient");
  if (includeMedical) await auditMedicalView(user, row.id, row.clinicId);
  const [encounters, chartItems] = includeTreatments ? await patientsRepository.treatmentHistory(row.id) : [null, null];

  const guardian = row.patientGuardians[0];
  return {
    id: row.id,
    clinicId: row.clinicId,
    patientNo: row.patientNo,
    fullName: row.contact.fullName,
    phone: row.contact.phone,
    email: row.contact.email,
    address: row.contact.address,
    preferredChannel: row.contact.preferredChannel,
    dob: toDateString(row.dob),
    sex: row.sex,
    civilStatus: row.civilStatus,
    occupation: row.occupation,
    status: row.status,
    createdAt: row.createdAt,
    primaryDentistId: row.primaryDentistId,
    primaryDentist: row.primaryDentist && { id: row.primaryDentist.id, name: row.primaryDentist.fullName },
    payer: row.payer,
    hmoMemberNo: row.hmoMemberNo,
    scPwdId: row.scPwdId,
    emergencyContact: guardian ? { name: guardian.guardianContact.fullName, phone: guardian.guardianContact.phone, relationship: guardian.relationship } : null,
    upcoming: row.appointments.map((a) => ({ id: a.id, startsAt: a.startsAt, status: a.status, serviceName: a.service?.name ?? null, dentistName: a.dentist?.fullName ?? null })),
    clinical: includeMedical
      ? { allergies: row.medicalAlerts ?? null, medicalConditions: row.medicalConditions ?? null, medications: row.medications ?? null }
      : null,
    visits:
      encounters
        ? encounters.map((e) => ({
            id: e.id,
            occurredAt: e.occurredAt,
            dentistName: e.dentist?.fullName ?? null,
            procedures: e.treatmentItems.map((t) => (t.toothCode ? `${t.service.name}, tooth ${t.toothCode}` : t.service.name)),
          }))
        : null,
    chart: chartItems ? chartFrom(chartItems) : null,
  };
}

export async function getPatientFormOptions(user: AuthUser): Promise<PatientFormOptions> {
  assertPermission(user, "patients.read");
  const [dentists, hmos] = await patientsRepository.formOptions(user.clinicId);
  return { dentists: dentists.map((d) => ({ id: d.id, name: d.fullName })), hmos };
}

/** Parses clinical input when given; only roles with `patients.medical.update` may send it. */
function parseClinical(user: AuthUser, clinical: Partial<PatientClinicalInput> | undefined): PatientClinicalData | null {
  if (!clinical) return null;
  assertPermission(user, "patients.medical.update");
  return patientClinicalSchema.parse(clinical);
}

/** Checks references and applies the dentist rule: scoped users can only file patients under themselves. */
async function prepareData(user: AuthUser, input: PatientInput, tx: TransactionClient): Promise<PatientData> {
  const data = patientInputSchema.parse(input);
  const { assigneeId } = recordScope(user);
  if (assigneeId) data.primaryDentistId = assigneeId;
  if (data.primaryDentistId && !(await patientsRepository.isClinicDentist(user.clinicId, data.primaryDentistId, tx))) {
    throw Errors.validation({ primaryDentistId: ["Choose a dentist from the list"] });
  }
  if (data.payerId && !(await patientsRepository.isClinicHmo(user.clinicId, data.payerId, tx))) {
    throw Errors.validation({ payerId: ["Choose an HMO from the list"] });
  }
  return data;
}

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export async function createPatient(user: AuthUser, input: PatientInput, clinicalInput?: Partial<PatientClinicalInput>): Promise<{ id: string }> {
  assertPermission(user, "patients.create");
  const clinical = parseClinical(user, clinicalInput);

  const attempt = () =>
    prisma.$transaction(async (tx) => {
      const data = await prepareData(user, input, tx);
      const patientNo = `P-${String((await patientsRepository.maxPatientNumber(user.clinicId, tx)) + 1).padStart(4, "0")}`;
      const created = await patientsRepository.create(user.clinicId, patientNo, data, clinical, tx);
      await audit(
        { action: AUDIT_ACTIONS.PATIENT_CREATED, resourceType: "patient", resourceId: created.id, actorId: user.id, clinicId: user.clinicId, metadata: { patientNo } },
        tx,
      );
      return created;
    });

  // Two people registering at the same moment can pick the same number; the unique index catches it.
  try {
    return await attempt();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return attempt();
  }
}

export async function updatePatient(user: AuthUser, rawId: unknown, input: PatientInput, clinicalInput?: Partial<PatientClinicalInput>): Promise<void> {
  assertPermission(user, "patients.update");
  const id = patientIdSchema.parse(rawId);
  const clinical = parseClinical(user, clinicalInput);

  await prisma.$transaction(async (tx) => {
    const existing = await patientsRepository.exists(recordScope(user), id, tx);
    if (!existing) throw Errors.notFound("patient");
    const data = await prepareData(user, input, tx);
    await patientsRepository.update(user.clinicId, existing, data, clinical, tx);
    const entry = { resourceType: "patient", resourceId: id, actorId: user.id, clinicId: user.clinicId };
    await audit({ ...entry, action: AUDIT_ACTIONS.PATIENT_UPDATED }, tx);
    if (clinical) await audit({ ...entry, action: AUDIT_ACTIONS.PATIENT_MEDICAL_UPDATED }, tx);
  });
}
