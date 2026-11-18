import type { CalendarAppointment } from "@backend/features/appointments/appointments.types";

export interface AssignedPatient {
  id: string;
  name: string;
  patientNo: string;
}

export interface DentistSummary {
  id: string;
  name: string;
  /** Appointments on the chosen day, no-shows left out. */
  appointmentCount: number;
  /** Null when the viewer can't see patient records. */
  patientCount: number | null;
}

export interface DentistDetail extends DentistSummary {
  appointments: CalendarAppointment[];
  /** Null when the viewer can't see patient records. */
  patients: AssignedPatient[] | null;
}

export interface DentistsBoard {
  date: string;
  dentists: DentistSummary[];
  selected: DentistDetail | null;
}
