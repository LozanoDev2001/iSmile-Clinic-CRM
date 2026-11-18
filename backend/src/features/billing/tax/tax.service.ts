import "server-only";
import { addDays, clinicToday } from "@backend/config/clinic";
import { settingsRepository } from "@backend/features/settings/settings.repository";
import { clinicProfileFrom } from "@backend/features/settings/settings.types";
import type { AuthUser } from "@backend/lib/authorization";
import { Errors } from "@backend/lib/errors/app-error";
import { assertBillingTab } from "../billing.access";
import { birDeadlinesBetween, type TaxDeadline } from "./tax.deadlines";

const LOOK_BACK_DAYS = 30;
const LOOK_AHEAD_DAYS = 120;

export interface TaxCalendar {
  today: string;
  vatRegistered: boolean;
  deadlines: TaxDeadline[];
}

/** BIR deadlines from a month back to four months ahead; amounts are left to the accountant. */
export async function getTaxCalendar(user: AuthUser): Promise<TaxCalendar> {
  assertBillingTab(user, "tax");
  const clinic = await settingsRepository.findClinicSettings(user.clinicId);
  if (!clinic) throw Errors.notFound("clinic");
  const { vatRegistered } = clinicProfileFrom(clinic.name, clinic.settings);
  const today = clinicToday();
  return { today, vatRegistered, deadlines: birDeadlinesBetween(addDays(today, -LOOK_BACK_DAYS), addDays(today, LOOK_AHEAD_DAYS), vatRegistered) };
}
