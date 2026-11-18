import type { z } from "zod";
import type { NamedRef } from "@backend/features/patients/patients.types";
import type { OpeningHours } from "@backend/features/settings/settings.types";
import type { APPOINTMENT_STATUSES, BOOKING_SOURCES, bookAppointmentSchema, rescheduleAppointmentSchema } from "./appointment.schema";

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export type BookingSource = (typeof BOOKING_SOURCES)[number];
export type BookAppointmentInput = z.input<typeof bookAppointmentSchema>;
export type RescheduleAppointmentInput = z.input<typeof rescheduleAppointmentSchema>;

export interface CalendarAppointment {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  bookingSource: string | null;
  notes: string | null;
  patient: { id: string; name: string; patientNo: string; phone: string | null; payerName: string | null };
  dentist: NamedRef | null;
  service: NamedRef | null;
}

export interface BookableService extends NamedRef {
  durationMinutes: number | null;
}

export interface BookingOptions {
  dentists: NamedRef[];
  services: BookableService[];
  hours: OpeningHours[];
  /** Set for scoped users (dentists), who can only book themselves. */
  lockedDentistId: string | null;
}
