import "server-only";
import { Prisma } from "@backend/generated/prisma/client";
import type { RecordScope } from "@backend/lib/authorization";
import { prisma, type TransactionClient } from "@backend/lib/prisma";
import type { AppointmentStatus, CalendarAppointment } from "./appointments.types";

/** Appointments that no longer hold a time slot. */
const FREED_STATUSES: AppointmentStatus[] = ["cancelled", "no_show"];

/** Dentists only see their own appointments. Applied to EVERY query. */
function scopeWhere(scope: RecordScope): Prisma.AppointmentWhereInput {
  return { clinicId: scope.clinicId, ...(scope.assigneeId ? { dentistId: scope.assigneeId } : {}) };
}

const calendarSelect = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  bookingSource: true,
  notes: true,
  patientId: true,
  dentistId: true,
  patient: { select: { id: true, patientNo: true, contact: { select: { fullName: true, phone: true } }, payer: { select: { name: true } } } },
  dentist: { select: { id: true, fullName: true } },
  service: { select: { id: true, name: true } },
} satisfies Prisma.AppointmentSelect;

type CalendarRow = Prisma.AppointmentGetPayload<{ select: typeof calendarSelect }>;

export function toCalendarAppointment(row: CalendarRow): CalendarAppointment {
  return {
    id: row.id,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status as AppointmentStatus,
    bookingSource: row.bookingSource,
    notes: row.notes,
    patient: { id: row.patient.id, name: row.patient.contact.fullName, patientNo: row.patient.patientNo, phone: row.patient.contact.phone, payerName: row.patient.payer?.name ?? null },
    dentist: row.dentist && { id: row.dentist.id, name: row.dentist.fullName },
    service: row.service,
  };
}

interface SlotData {
  dentistId: string;
  startsAt: Date;
  endsAt: Date;
}

export const appointmentsRepository = {
  /** Appointments starting in [from, to), cancelled ones left out. */
  async listInRange(scope: RecordScope, from: Date, to: Date) {
    const rows = await prisma.appointment.findMany({
      where: { AND: [scopeWhere(scope), { startsAt: { gte: from, lt: to }, status: { not: "cancelled" } }] },
      select: calendarSelect,
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toCalendarAppointment);
  },

  findById(scope: RecordScope, id: string, tx: TransactionClient = prisma) {
    return tx.appointment.findFirst({ where: { AND: [scopeWhere(scope), { id }] }, select: calendarSelect });
  },

  /** Times taken in [from, to) by the dentist or the patient, as [start, end) pairs. */
  busy(clinicId: string, who: { dentistId?: string; patientId?: string }, from: Date, to: Date, excludeId: string | undefined, tx: TransactionClient = prisma) {
    const people = [who.dentistId ? { dentistId: who.dentistId } : null, who.patientId ? { patientId: who.patientId } : null].filter((x) => x !== null);
    return tx.appointment.findMany({
      where: {
        clinicId,
        OR: people,
        startsAt: { lt: to },
        endsAt: { gt: from },
        status: { notIn: FREED_STATUSES },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { startsAt: true, endsAt: true, dentistId: true, patientId: true },
    });
  },

  /** Serialises bookings for one dentist, so two people can't take the same slot at once. */
  async lockDentist(dentistId: string, tx: TransactionClient) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${dentistId} FOR UPDATE`);
  },

  create(clinicId: string, data: SlotData & { patientId: string; serviceId: string | null; bookingSource: string; notes: string | null; createdById: string }, tx: TransactionClient) {
    return tx.appointment.create({ data: { clinicId, status: "booked", ...data }, select: { id: true } });
  },

  /** Moves the appointment; a no-show that is rebooked becomes booked again. */
  reschedule(id: string, data: SlotData, tx: TransactionClient) {
    return tx.appointment.update({ where: { id }, data: { ...data, status: "booked" }, select: { id: true } });
  },

  setStatus(id: string, status: AppointmentStatus, tx: TransactionClient) {
    return tx.appointment.update({ where: { id }, data: { status }, select: { id: true } });
  },

  /** The visit record the patient file's history is built from. */
  createEncounter(data: { clinicId: string; patientId: string; appointmentId: string; dentistId: string | null }, tx: TransactionClient) {
    return tx.encounter.create({ data, select: { id: true } });
  },
};
