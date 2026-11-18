import { z } from "zod";

export const APPOINTMENT_STATUSES = ["booked", "confirmed", "checked_in", "in_progress", "completed", "cancelled", "no_show"] as const;
export const BOOKING_SOURCES = ["front_desk", "phone", "walk_in", "online", "lead"] as const;
/** Sources staff pick when booking by hand; "lead" is set when a lead books its consult. */
export const STAFF_BOOKING_SOURCES = ["front_desk", "phone", "walk_in", "online"] as const;

/** Which status changes staff can make from each status. Completed and cancelled are final. */
export const STATUS_TRANSITIONS: Record<(typeof APPOINTMENT_STATUSES)[number], readonly (typeof APPOINTMENT_STATUSES)[number][]> = {
  booked: ["confirmed", "checked_in", "no_show"],
  confirmed: ["checked_in", "no_show"],
  checked_in: ["in_progress", "completed"],
  in_progress: ["completed"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export const SLOT_MINUTES = 30;
export const MIN_DURATION = 15;
export const MAX_DURATION = 240;
const MAX_RANGE_DAYS = 42;

const date = z.iso.date("Pick a valid date");

export const appointmentIdSchema = z.uuid("Invalid appointment identifier");

export const rangeQuerySchema = z
  .object({ from: date, to: date })
  .refine((r) => r.from <= r.to, "The range must end after it starts")
  .refine((r) => (Date.parse(r.to) - Date.parse(r.from)) / 86_400_000 <= MAX_RANGE_DAYS, "Pick a shorter range");

const slotFields = {
  dentistId: z.uuid("Choose a dentist"),
  date,
  startMinutes: z.number({ error: "Pick an open time" }).int().min(0).max(24 * 60 - MIN_DURATION),
  durationMinutes: z.number().int().min(MIN_DURATION).max(MAX_DURATION).multipleOf(5),
};

export const openSlotsQuerySchema = z.object({
  dentistId: slotFields.dentistId,
  date,
  durationMinutes: slotFields.durationMinutes,
  excludeAppointmentId: appointmentIdSchema.optional(),
});

export const bookAppointmentSchema = z.object({
  ...slotFields,
  patientId: z.uuid("Choose a patient"),
  serviceId: z.union([z.uuid(), z.literal(""), z.null()]).transform((v) => v || null),
  bookingSource: z.enum(BOOKING_SOURCES),
  notes: z.string().trim().max(1000).nullable().transform((v) => v || null),
});

export const rescheduleAppointmentSchema = z.object(slotFields);

export const changeStatusSchema = z.object({ status: z.enum(APPOINTMENT_STATUSES).exclude(["booked", "cancelled"]) });
