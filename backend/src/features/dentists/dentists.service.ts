import "server-only";
import { z } from "zod";
import { addDays, clinicInstant, clinicToday } from "@backend/config/clinic";
import { appointmentsRepository } from "@backend/features/appointments/appointments.repository";
import { assertPermission, can, recordScope, type AuthUser } from "@backend/lib/authorization";
import { dentistsRepository } from "./dentists.repository";
import type { DentistsBoard } from "./dentists.types";

const ASSIGNED_LIST_LIMIT = 100;

const boardQuerySchema = z.object({
  dentist: z.uuid().optional().catch(undefined),
  date: z.iso.date().catch(() => clinicToday()),
});

/** Every dentist's load on one clinic day, plus the full schedule and patients of the selected dentist. */
export async function getDentistsBoard(user: AuthUser, rawQuery: unknown): Promise<DentistsBoard> {
  assertPermission(user, "appointments.read");
  const { dentist, date } = boardQuerySchema.parse(rawQuery);
  const scope = recordScope(user);
  const showPatients = can(user, "patients.read");

  const [dentists, appointments] = await Promise.all([dentistsRepository.list(scope), appointmentsRepository.listInRange(scope, clinicInstant(date), clinicInstant(addDays(date, 1)))]);
  const counts = showPatients && dentists.length ? await dentistsRepository.assignedCounts(user.clinicId, dentists.map((d) => d.id)) : [];

  const summaries = dentists.map((d) => ({
    id: d.id,
    name: d.fullName,
    appointmentCount: appointments.filter((a) => a.dentist?.id === d.id && a.status !== "no_show").length,
    patientCount: showPatients ? (counts.find((c) => c.primaryDentistId === d.id)?._count ?? 0) : null,
  }));
  const summary = summaries.find((d) => d.id === dentist) ?? summaries[0];
  if (!summary) return { date, dentists: summaries, selected: null };

  const patients = showPatients ? await dentistsRepository.recentAssigned(user.clinicId, summary.id, ASSIGNED_LIST_LIMIT) : null;
  return {
    date,
    dentists: summaries,
    selected: {
      ...summary,
      appointments: appointments.filter((a) => a.dentist?.id === summary.id),
      patients: patients?.map((p) => ({ id: p.id, name: p.contact.fullName, patientNo: p.patientNo })) ?? null,
    },
  };
}
