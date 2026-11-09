import { addDays, clinicToday, weekdayOf } from "@/config/clinic";
import { APPOINTMENT_STATUSES } from "@backend/features/appointments/appointment.schema";
import type { AppointmentStatus, BookingSource } from "@backend/features/appointments/appointments.types";

export const VIEWS = ["day", "week", "month"] as const;
export type CalendarView = (typeof VIEWS)[number];

/** Everything the calendar shows is driven by the URL, so views are shareable and server-rendered. */
export interface CalendarState {
  view: CalendarView;
  date: string;
  /** Dentist ids switched off in the filter. */
  off: string[];
  /** Statuses switched off in the filter. */
  hide: AppointmentStatus[];
  /** Open appointment panel. */
  appt?: string;
  /** "new" opens the booking form; "move" reschedules `appt`. */
  form?: "new" | "move";
  /** Patient to preselect in the booking form. */
  patient?: string;
}

export interface CalendarSearchParams {
  view?: string;
  date?: string;
  off?: string;
  hide?: string;
  appt?: string;
  form?: string;
  patient?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const ids = (value: string | undefined) => (value ?? "").split(",").filter((id) => UUID.test(id));

export function parseCalendarState(params: CalendarSearchParams): CalendarState {
  const date = ISO_DATE.test(params.date ?? "") && !Number.isNaN(Date.parse(params.date!)) ? params.date! : clinicToday();
  return {
    view: (VIEWS as readonly string[]).includes(params.view ?? "") ? (params.view as CalendarView) : "day",
    date,
    off: ids(params.off),
    hide: (params.hide ?? "").split(",").filter((s): s is AppointmentStatus => (APPOINTMENT_STATUSES as readonly string[]).includes(s)),
    appt: UUID.test(params.appt ?? "") ? params.appt : undefined,
    form: params.form === "new" || params.form === "move" ? params.form : undefined,
    patient: UUID.test(params.patient ?? "") ? params.patient : undefined,
  };
}

export function calendarHref(state: CalendarState, patch: Partial<CalendarState> = {}): string {
  const next = { ...state, ...patch };
  const params = new URLSearchParams();
  if (next.view !== "day") params.set("view", next.view);
  if (next.date !== clinicToday()) params.set("date", next.date);
  if (next.off.length) params.set("off", next.off.join(","));
  if (next.hide.length) params.set("hide", next.hide.join(","));
  if (next.appt) params.set("appt", next.appt);
  if (next.form) params.set("form", next.form);
  if (next.patient) params.set("patient", next.patient);
  const qs = params.toString();
  return qs ? `/calendar?${qs}` : "/calendar";
}

/** Monday of the week containing `date`. */
export const weekStart = (date: string) => addDays(date, -((weekdayOf(date) + 6) % 7));

/** First and last day the view shows. Month views cover whole weeks. */
export function viewRange(view: CalendarView, date: string): { from: string; to: string } {
  if (view === "day") return { from: date, to: date };
  if (view === "week") return { from: weekStart(date), to: addDays(weekStart(date), 6) };
  const first = `${date.slice(0, 7)}-01`;
  const last = addDays(`${addDays(first, 31).slice(0, 7)}-01`, -1);
  return { from: weekStart(first), to: addDays(weekStart(last), 6) };
}

/** Moves the anchor date one view-length back or forward. */
export function shiftDate(view: CalendarView, date: string, step: -1 | 1): string {
  if (view === "day") return addDays(date, step);
  if (view === "week") return addDays(date, 7 * step);
  const [y, m] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + step, 1));
  return target.toISOString().slice(0, 10);
}

export const STATUS_META: Record<AppointmentStatus, { label: string; card: string; dot: string }> = {
  booked: { label: "Booked", card: "border-[#D5DCE5] bg-white text-[#0E2A47]", dot: "bg-[#C3CCD8]" },
  confirmed: { label: "Confirmed", card: "border-[#5088C4] bg-[#E4EEFB] text-[#0E2A47]", dot: "bg-[#5088C4]" },
  checked_in: { label: "Arrived", card: "border-[#A9C8F0] bg-[#D6ECFA] text-[#0E2A47]", dot: "bg-[#A9C8F0]" },
  in_progress: { label: "In chair", card: "border-[#F39A1E] bg-[#FDE3BD] text-[#0E2A47]", dot: "bg-[#F39A1E]" },
  completed: { label: "Completed", card: "border-[#9EDBC0] bg-[#E8F7EF] text-[#0B3D26]", dot: "bg-[#9EDBC0]" },
  no_show: { label: "No-show", card: "border-[#F9B4AA] bg-[#FDECEA] text-[#5A1308] line-through", dot: "bg-[#F9B4AA]" },
  cancelled: { label: "Cancelled", card: "border-[#E3E7ED] bg-[#EEF1F5] text-[#5E6B7E] line-through", dot: "bg-[#E3E7ED]" },
};

/** Statuses the filter offers (cancelled appointments are never shown). */
export const FILTER_STATUSES: AppointmentStatus[] = ["booked", "confirmed", "checked_in", "in_progress", "completed", "no_show"];

export const SOURCE_LABELS: Record<BookingSource, string> = {
  front_desk: "Front desk",
  phone: "Phone call",
  walk_in: "Walk-in",
  online: "Online booking",
  lead: "From a lead",
};

export { formatMinutes } from "@/config/clinic";

const longDate = new Intl.DateTimeFormat("en-PH", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("en-PH", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const monthTitle = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });

const asUtc = (date: string) => new Date(`${date}T00:00:00Z`);
export const formatLongDate = (date: string) => longDate.format(asUtc(date));
export const formatShortDate = (date: string) => shortDate.format(asUtc(date));
export const formatMonth = (date: string) => monthTitle.format(asUtc(date));
