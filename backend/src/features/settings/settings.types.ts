import type { z } from "zod";
import { weekdayOf } from "@backend/config/clinic";
import { WEEKDAYS, clinicProfileSchema, type signInRulesSchema } from "./settings.schema";

export type SignInRules = z.infer<typeof signInRulesSchema>;
export type ClinicProfile = z.infer<typeof clinicProfileSchema>;
export type OpeningHours = ClinicProfile["hours"][number];
/** The part of the profile stored under `profile` in `clinics.settings`; the name lives in `clinics.name`. */
export type StoredClinicProfile = Omit<ClinicProfile, "name">;

export const DEFAULT_SIGN_IN_RULES: SignInRules = { lockAfterFailedLogins: true, idleSignOut: false };

/** Sign-in rules stored under `signIn` in `clinics.settings` (JSON), with safe defaults. */
export function signInRulesFrom(settings: unknown): SignInRules {
  const stored = (settings as { signIn?: Partial<SignInRules> } | null)?.signIn ?? {};
  return {
    lockAfterFailedLogins: typeof stored.lockAfterFailedLogins === "boolean" ? stored.lockAfterFailedLogins : DEFAULT_SIGN_IN_RULES.lockAfterFailedLogins,
    idleSignOut: typeof stored.idleSignOut === "boolean" ? stored.idleSignOut : DEFAULT_SIGN_IN_RULES.idleSignOut,
  };
}

// Hours start closed so the clinic is never shown as open at times nobody confirmed.
const DEFAULT_HOURS: OpeningHours[] = WEEKDAYS.map((day) => ({ day, closed: true, open: "09:00", close: "18:00" }));

/** Clinic profile from `clinics.name` plus `profile` in `clinics.settings`; falls back to empty values if unset or malformed. */
export function clinicProfileFrom(name: string, settings: unknown): ClinicProfile {
  const stored = (settings as { profile?: unknown } | null)?.profile;
  const parsed = clinicProfileSchema.omit({ name: true }).safeParse(stored);
  if (parsed.success) return { name, ...parsed.data };
  return { name, tagline: "", phone: "", address: "", hours: DEFAULT_HOURS };
}

/** Opening hours for a calendar date (YYYY-MM-DD). WEEKDAYS starts on Monday; weekdayOf() counts from Sunday. */
export const openingHoursOn = (hours: OpeningHours[], date: string) => hours.find((h) => h.day === WEEKDAYS[(weekdayOf(date) + 6) % 7]);
