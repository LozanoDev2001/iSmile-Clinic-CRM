// The clinic operates in the Philippines (UTC+8, no daylight saving).
export const CLINIC_TIME_ZONE = "Asia/Manila";
export const CLINIC_UTC_OFFSET = "+08:00";

const MS_PER_DAY = 86_400_000;

const clinicDateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TIME_ZONE });
const clinicTimeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: CLINIC_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Today's calendar date at the clinic, as YYYY-MM-DD. */
export function clinicToday(now = new Date()): string {
  return clinicDateFormat.format(now);
}

/** The clinic-local calendar date (YYYY-MM-DD) of an instant. */
export const clinicDateOf = (instant: Date) => clinicDateFormat.format(instant);

/** Minutes since clinic-local midnight of an instant. */
export function clinicMinutesOf(instant: Date): number {
  const [h, m] = clinicTimeFormat.format(instant).split(":").map(Number);
  return h * 60 + m;
}

/** The instant of a clinic-local date (YYYY-MM-DD) and minutes after midnight. */
export function clinicInstant(date: string, minutes = 0): Date {
  return new Date(new Date(`${date}T00:00:00${CLINIC_UTC_OFFSET}`).getTime() + minutes * 60_000);
}

/** A calendar date shifted by whole days. */
export function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Day of the week of a calendar date, 0 = Sunday. */
export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** "09:30" for 570 minutes. */
export const minutesToTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** 570 for "09:30". */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Whole years between a YYYY-MM-DD birth date and `today` (clinic-local). */
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
  return Math.round((next - t.getTime()) / MS_PER_DAY);
}

/** "9:30 AM" for 570 minutes after midnight. */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = String(minutes % 60).padStart(2, "0");
  return `${h % 12 || 12}:${m} ${h >= 12 ? "PM" : "AM"}`;
}
