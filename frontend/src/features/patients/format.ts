import { CLINIC_TIME_ZONE, clinicToday } from "@/config/clinic";
import type { CIVIL_STATUSES, MESSAGE_CHANNELS, SEXES } from "@backend/features/patients/patient.schema";

export const KID_MAX_AGE = 12;

export const SEX_LABELS: Record<(typeof SEXES)[number], string> = { female: "Female", male: "Male" };
export const CIVIL_STATUS_LABELS: Record<(typeof CIVIL_STATUSES)[number], string> = {
  single: "Single",
  married: "Married",
  widowed: "Widowed",
  separated: "Separated",
};
export const CHANNEL_LABELS: Record<(typeof MESSAGE_CHANNELS)[number], string> = {
  viber: "Viber",
  messenger: "Messenger",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  sms: "SMS",
  email: "Email",
};

/** Label for a stored option value, falling back to the raw value. */
export const labelOf = (labels: Record<string, string>, value: string | null) => (value ? (labels[value] ?? value) : null);

/** Whole years between a YYYY-MM-DD birth date and today at the clinic. */
export function ageFrom(dob: string | null, today = clinicToday()): number | null {
  if (!dob) return null;
  const [by, bm, bd] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** Days until the next birthday (0 = today), or null without a birth date. */
export function daysToBirthday(dob: string | null, today = clinicToday()): number | null {
  if (!dob) return null;
  const t = new Date(`${today}T00:00:00Z`);
  const [, bm, bd] = dob.split("-").map(Number);
  let next = Date.UTC(t.getUTCFullYear(), bm - 1, bd);
  if (next < t.getTime()) next = Date.UTC(t.getUTCFullYear() + 1, bm - 1, bd);
  return Math.round((next - t.getTime()) / 86_400_000);
}

const dateFmt = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dateTimeFmt = new Intl.DateTimeFormat("en-PH", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: CLINIC_TIME_ZONE });
const instantDateFmt = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: CLINIC_TIME_ZONE });

/** A calendar date (YYYY-MM-DD), e.g. "3 Aug 1975". */
export const formatDate = (date: string) => dateFmt.format(new Date(`${date}T00:00:00Z`));
/** A moment in time, as a clinic-local date. */
export const formatDay = (instant: Date) => instantDateFmt.format(instant);
/** A moment in time, as a clinic-local day and time, e.g. "Mon, 9 Nov, 2:30 pm". */
export const formatDateTime = (instant: Date) => dateTimeFmt.format(instant);
