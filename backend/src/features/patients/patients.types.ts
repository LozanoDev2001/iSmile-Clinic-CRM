import type { z } from "zod";
import type { listPatientsQuerySchema, patientClinicalSchema, patientInputSchema } from "./patient.schema";

// ─── Inputs ─────────────────────────────────────────────────────────────────

export type ListPatientsQuery = z.infer<typeof listPatientsQuerySchema>;
export type PatientFilter = ListPatientsQuery["filter"];
export type PatientInput = z.input<typeof patientInputSchema>;
export type PatientData = z.output<typeof patientInputSchema>;
export type PatientClinicalInput = z.input<typeof patientClinicalSchema>;
export type PatientClinicalData = z.output<typeof patientClinicalSchema>;

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
  /** Calendar date, YYYY-MM-DD. Demographic, not clinical: the front desk registers it. */
  dob: string | null;
  sex: string | null;
  primaryDentistId: string | null;
  status: string;
  createdAt: Date;
}

/** Returned only to roles with `patients.medical.read`. */
export interface PatientMedicalDetail extends PatientSummary {
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

export interface NamedRef {
  id: string;
  name: string;
}

export interface EmergencyContact {
  name: string;
  relationship: string | null;
  phone: string | null;
}

export interface PatientClinical {
  allergies: string | null;
  medicalConditions: string | null;
  medications: string | null;
}

export interface PatientVisit {
  id: string;
  occurredAt: Date;
  dentistName: string | null;
  procedures: string[];
}

export interface UpcomingAppointment {
  id: string;
  startsAt: Date;
  serviceName: string | null;
  dentistName: string | null;
  status: string;
}

export type ToothCondition = "treated" | "crown" | "planned" | "extracted";

/** Everything the patient file shows. Sections the user may not see are null. */
export interface PatientFile extends PatientSummary {
  civilStatus: string | null;
  occupation: string | null;
  address: string | null;
  preferredChannel: string | null;
  marketingOptIn: boolean;
  primaryDentist: NamedRef | null;
  payer: NamedRef | null;
  hmoMemberNo: string | null;
  scPwdId: string | null;
  emergencyContact: EmergencyContact | null;
  upcoming: UpcomingAppointment[];
  /** Needs `patients.medical.read`. */
  clinical: PatientClinical | null;
  /** Visit history and dental chart; need `treatments.read`. */
  visits: PatientVisit[] | null;
  chart: Record<string, ToothCondition> | null;
}

export interface PatientFormOptions {
  dentists: NamedRef[];
  hmos: NamedRef[];
}
