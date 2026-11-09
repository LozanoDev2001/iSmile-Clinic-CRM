import "server-only";
import { addDays, clinicDateOf, clinicInstant, clinicMinutesOf, clinicToday, timeToMinutes } from "@backend/config/clinic";
import { catalogRepository } from "@backend/features/catalog/catalog.repository";
import { patientsRepository } from "@backend/features/patients/patients.repository";
import { settingsRepository } from "@backend/features/settings/settings.repository";
import { clinicProfileFrom, openingHoursOn, type OpeningHours } from "@backend/features/settings/settings.types";
import { assertPermission, recordScope, type AuthUser } from "@backend/lib/authorization";
import { Errors } from "@backend/lib/errors/app-error";
import { AUDIT_ACTIONS, audit } from "@backend/lib/logging/audit";
import { prisma, type TransactionClient } from "@backend/lib/prisma";
import {
  SLOT_MINUTES,
  STATUS_TRANSITIONS,
  appointmentIdSchema,
  bookAppointmentSchema,
  changeStatusSchema,
  openSlotsQuerySchema,
  rangeQuerySchema,
  rescheduleAppointmentSchema,
} from "./appointment.schema";
import { appointmentsRepository, toCalendarAppointment } from "./appointments.repository";
import type { AppointmentStatus, BookAppointmentInput, BookingOptions, CalendarAppointment, RescheduleAppointmentInput } from "./appointments.types";

/** Statuses an appointment can still be moved or cancelled from. */
const MOVABLE: AppointmentStatus[] = ["booked", "confirmed", "no_show"];
const CANCELLABLE: AppointmentStatus[] = ["booked", "confirmed"];

const SLOT_TAKEN = "That time is no longer open. Pick another time.";

interface Interval {
  start: number;
  end: number;
}

/** Start times (minutes after midnight) where `duration` fits inside opening hours without touching a busy interval. */
export function computeOpenSlots(hours: OpeningHours | undefined, duration: number, busy: Interval[], earliest: number | null): number[] {
  if (!hours || hours.closed) return [];
  const slots: number[] = [];
  const close = timeToMinutes(hours.close);
  for (let start = timeToMinutes(hours.open); start + duration <= close; start += SLOT_MINUTES) {
    if (earliest !== null && start < earliest) continue;
    if (busy.some((b) => start < b.end && start + duration > b.start)) continue;
    slots.push(start);
  }
  return slots;
}

async function clinicHours(clinicId: string, tx: TransactionClient = prisma): Promise<OpeningHours[]> {
  const clinic = await settingsRepository.findClinicSettings(clinicId, tx);
  if (!clinic) throw Errors.notFound("clinic");
  return clinicProfileFrom(clinic.name, clinic.settings).hours;
}

/** Open start times for a dentist on a clinic-local date, leaving out the past. */
async function openSlotsFor(clinicId: string, dentistId: string, date: string, duration: number, excludeId: string | undefined, tx: TransactionClient = prisma) {
  const today = clinicToday();
  if (date < today) return [];
  const [hours, taken] = await Promise.all([
    clinicHours(clinicId, tx),
    appointmentsRepository.busy(clinicId, { dentistId }, clinicInstant(date), clinicInstant(addDays(date, 1)), excludeId, tx),
  ]);
  const busy = taken.map((b) => ({ start: clinicMinutesOf(b.startsAt), end: b.endsAt >= clinicInstant(addDays(date, 1)) ? 24 * 60 : clinicMinutesOf(b.endsAt) }));
  return computeOpenSlots(openingHoursOn(hours, date), duration, busy, date === today ? clinicMinutesOf(new Date()) : null);
}

export async function listAppointments(user: AuthUser, rawRange: unknown): Promise<CalendarAppointment[]> {
  assertPermission(user, "appointments.read");
  const { from, to } = rangeQuerySchema.parse(rawRange);
  return appointmentsRepository.listInRange(recordScope(user), clinicInstant(from), clinicInstant(addDays(to, 1)));
}

export async function getBookingOptions(user: AuthUser): Promise<BookingOptions> {
  assertPermission(user, "appointments.read");
  const [[dentists], services, hours] = await Promise.all([
    patientsRepository.formOptions(user.clinicId),
    catalogRepository.listBookable(user.clinicId),
    clinicHours(user.clinicId),
  ]);
  return {
    dentists: dentists.map((d) => ({ id: d.id, name: d.fullName })),
    services,
    hours,
    lockedDentistId: recordScope(user).assigneeId ?? null,
  };
}

export async function getOpenSlots(user: AuthUser, rawQuery: unknown): Promise<number[]> {
  assertPermission(user, "appointments.read");
  const query = openSlotsQuerySchema.parse(rawQuery);
  return openSlotsFor(user.clinicId, query.dentistId, query.date, query.durationMinutes, query.excludeAppointmentId);
}

/** Validates the dentist and the time, under a lock on the dentist so two bookings can't take one slot. */
async function assertSlotFree(
  user: AuthUser,
  slot: { dentistId: string; date: string; startMinutes: number; durationMinutes: number },
  patientId: string,
  excludeId: string | undefined,
  tx: TransactionClient,
) {
  const { assigneeId } = recordScope(user);
  if (assigneeId && slot.dentistId !== assigneeId) throw Errors.forbidden("You can only book appointments for yourself.");
  if (!(await patientsRepository.isClinicDentist(user.clinicId, slot.dentistId, tx))) throw Errors.validation({ dentistId: ["Choose a dentist from the list"] });

  await appointmentsRepository.lockDentist(slot.dentistId, tx);
  const open = await openSlotsFor(user.clinicId, slot.dentistId, slot.date, slot.durationMinutes, excludeId, tx);
  if (!open.includes(slot.startMinutes)) throw Errors.conflict(SLOT_TAKEN, { startMinutes: [SLOT_TAKEN] });

  const startsAt = clinicInstant(slot.date, slot.startMinutes);
  const endsAt = clinicInstant(slot.date, slot.startMinutes + slot.durationMinutes);
  const patientBusy = await appointmentsRepository.busy(user.clinicId, { patientId }, startsAt, endsAt, excludeId, tx);
  if (patientBusy.length) throw Errors.conflict("The patient already has an appointment at that time.");
  return { dentistId: slot.dentistId, startsAt, endsAt };
}

async function findInScope(user: AuthUser, rawId: unknown, tx: TransactionClient) {
  const id = appointmentIdSchema.parse(rawId);
  const row = await appointmentsRepository.findById(recordScope(user), id, tx);
  if (!row) throw Errors.notFound("appointment");
  return row;
}

export async function bookAppointment(user: AuthUser, input: BookAppointmentInput): Promise<{ id: string }> {
  assertPermission(user, "appointments.create");
  const data = bookAppointmentSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    if (!(await patientsRepository.exists(recordScope(user), data.patientId, tx))) throw Errors.validation({ patientId: ["Choose a patient from the list"] });
    if (data.serviceId && !(await catalogRepository.findActive(user.clinicId, data.serviceId, tx))) throw Errors.validation({ serviceId: ["Choose a service from the list"] });
    const slot = await assertSlotFree(user, data, data.patientId, undefined, tx);
    const created = await appointmentsRepository.create(
      user.clinicId,
      { ...slot, patientId: data.patientId, serviceId: data.serviceId, bookingSource: data.bookingSource, notes: data.notes, createdById: user.id },
      tx,
    );
    await audit(
      {
        action: AUDIT_ACTIONS.APPOINTMENT_BOOKED,
        resourceType: "appointment",
        resourceId: created.id,
        actorId: user.id,
        clinicId: user.clinicId,
        metadata: { startsAt: slot.startsAt.toISOString(), dentistId: slot.dentistId, patientId: data.patientId },
      },
      tx,
    );
    return created;
  });
}

export async function rescheduleAppointment(user: AuthUser, rawId: unknown, input: RescheduleAppointmentInput): Promise<CalendarAppointment> {
  assertPermission(user, "appointments.update");
  const data = rescheduleAppointmentSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const existing = await findInScope(user, rawId, tx);
    if (!MOVABLE.includes(existing.status as AppointmentStatus)) throw Errors.conflict("This appointment can no longer be moved.");
    const slot = await assertSlotFree(user, data, existing.patientId, existing.id, tx);
    await appointmentsRepository.reschedule(existing.id, slot, tx);
    await audit(
      {
        action: AUDIT_ACTIONS.APPOINTMENT_RESCHEDULED,
        resourceType: "appointment",
        resourceId: existing.id,
        actorId: user.id,
        clinicId: user.clinicId,
        before: { startsAt: existing.startsAt.toISOString(), dentistId: existing.dentistId, status: existing.status },
        metadata: { startsAt: slot.startsAt.toISOString(), dentistId: slot.dentistId },
      },
      tx,
    );
    const moved = await appointmentsRepository.findById(recordScope(user), existing.id, tx);
    if (!moved) throw Errors.notFound("appointment");
    return toCalendarAppointment(moved);
  });
}

export async function changeAppointmentStatus(user: AuthUser, rawId: unknown, input: unknown): Promise<CalendarAppointment> {
  assertPermission(user, "appointments.update");
  const { status } = changeStatusSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const existing = await findInScope(user, rawId, tx);
    const from = existing.status as AppointmentStatus;
    if (!STATUS_TRANSITIONS[from].includes(status)) throw Errors.conflict("That step isn't possible for this appointment any more.");
    if (status !== "confirmed" && clinicDateOf(existing.startsAt) > clinicToday()) {
      throw Errors.conflict("This can only be done on the day of the appointment.");
    }
    await appointmentsRepository.setStatus(existing.id, status, tx);
    if (status === "completed") {
      await appointmentsRepository.createEncounter({ clinicId: user.clinicId, patientId: existing.patientId, appointmentId: existing.id, dentistId: existing.dentistId }, tx);
    }
    await audit(
      { action: AUDIT_ACTIONS.APPOINTMENT_STATUS_CHANGED, resourceType: "appointment", resourceId: existing.id, actorId: user.id, clinicId: user.clinicId, before: { status: from }, metadata: { status } },
      tx,
    );
    return toCalendarAppointment({ ...existing, status });
  });
}

export async function cancelAppointment(user: AuthUser, rawId: unknown): Promise<void> {
  assertPermission(user, "appointments.cancel");
  await prisma.$transaction(async (tx) => {
    const existing = await findInScope(user, rawId, tx);
    if (!CANCELLABLE.includes(existing.status as AppointmentStatus)) throw Errors.conflict("Only upcoming appointments can be cancelled.");
    await appointmentsRepository.setStatus(existing.id, "cancelled", tx);
    await audit(
      { action: AUDIT_ACTIONS.APPOINTMENT_CANCELLED, resourceType: "appointment", resourceId: existing.id, actorId: user.id, clinicId: user.clinicId, before: { status: existing.status } },
      tx,
    );
  });
}
