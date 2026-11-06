import type { z } from "zod";
import type { listPatientsQuerySchema } from "./patient.schema";

// ─── Inputs ─────────────────────────────────────────────────────────────────

export type ListPatientsQuery = z.infer<typeof listPatientsQuerySchema>;

// ─── Outputs / DTOs ─────────────────────────────────────────────────────────

/** Visible to any role with `patients.read`. No clinical data. */
export interface PatientSummary {
  id: string;
  clinicId: string;
  branchId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  primaryDentistId: string | null;
  updatedAt: Date;
}

/** Returned only to roles with `patients.medical.read`. */
export interface PatientMedicalDetail extends PatientSummary {
  dateOfBirth: Date | null;
  medicalNotes: string | null;
  allergies: string | null;
}

export type PatientDetail = PatientSummary | PatientMedicalDetail;

export interface PatientListResult {
  items: PatientSummary[];
  total: number;
  page: number;
  pageSize: number;
}
