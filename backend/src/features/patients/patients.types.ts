import type { z } from "zod";
import type { listPatientsQuerySchema } from "./patient.schema";

// ─── Inputs ─────────────────────────────────────────────────────────────────

export type ListPatientsQuery = z.infer<typeof listPatientsQuerySchema>;

// ─── Outputs / DTOs ─────────────────────────────────────────────────────────

/** Visible to any role with `patients.read`. No clinical data. */
export interface PatientSummary {
  id: string;
  clinicId: string;
  patientNo: string;
  /** From the linked `contacts` row. */
  fullName: string;
  phone: string | null;
  email: string | null;
  primaryDentistId: string | null;
  status: string;
  createdAt: Date;
}

/** Returned only to roles with `patients.medical.read`. */
export interface PatientMedicalDetail extends PatientSummary {
  dob: Date | null;
  sex: string | null;
  medicalAlerts: string | null;
}

export type PatientDetail = PatientSummary | PatientMedicalDetail;

export interface PatientStats {
  total: number;
  createdSince: number;
}

export interface PatientListResult {
  items: PatientSummary[];
  total: number;
  page: number;
  pageSize: number;
}
