import "server-only";
import { assertPermission, can, recordScope, type AuthUser } from "@backend/lib/authorization";
import { Errors } from "@backend/lib/errors/app-error";
import { AUDIT_ACTIONS, audit } from "@backend/lib/logging/audit";
import { listPatientsQuerySchema, patientIdSchema } from "./patient.schema";
import { patientsRepository } from "./patients.repository";
import type { PatientDetail, PatientListResult } from "./patients.types";

/**
 * Reference implementation of the access pattern every clinical module
 * should follow: permission check → validated input → scoped query →
 * field-level gating of sensitive data → audit of sensitive reads.
 */

export async function listPatients(user: AuthUser, rawQuery: unknown): Promise<PatientListResult> {
  assertPermission(user, "patients.read");
  const query = listPatientsQuerySchema.parse(rawQuery);
  const { items, total } = await patientsRepository.list(recordScope(user), query);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getPatient(user: AuthUser, rawId: unknown): Promise<PatientDetail> {
  assertPermission(user, "patients.read");
  const id = patientIdSchema.parse(rawId);
  const includeMedical = can(user, "patients.medical.read");

  const patient = await patientsRepository.findById(recordScope(user), id, { includeMedical });
  if (!patient) throw Errors.notFound("patient");

  if (includeMedical) {
    await audit({
      action: AUDIT_ACTIONS.PATIENT_MEDICAL_VIEWED,
      resourceType: "patient",
      resourceId: patient.id,
      actorId: user.id,
      clinicId: patient.clinicId,
    });
  }
  return patient;
}
