import { CLINIC_TIME_ZONE } from "@/config/clinic";

export { ageFrom, daysToBirthday } from "@/config/clinic";
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

const dateFmt = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dateTimeFmt = new Intl.DateTimeFormat("en-PH", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: CLINIC_TIME_ZONE });
const instantDateFmt = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: CLINIC_TIME_ZONE });

/** A calendar date (YYYY-MM-DD), e.g. "3 Aug 1975". */
export const formatDate = (date: string) => dateFmt.format(new Date(`${date}T00:00:00Z`));
/** A moment in time, as a clinic-local date. */
export const formatDay = (instant: Date) => instantDateFmt.format(instant);
/** A moment in time, as a clinic-local day and time, e.g. "Mon, 9 Nov, 2:30 pm". */
export const formatDateTime = (instant: Date) => dateTimeFmt.format(instant);
