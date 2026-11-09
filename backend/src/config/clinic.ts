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
