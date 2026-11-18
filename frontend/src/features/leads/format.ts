import { CLINIC_TIME_ZONE } from "@/config/clinic";
import type { CALL_RESULTS } from "@backend/features/leads/lead.schema";
import type { LeadStage } from "@backend/features/leads/leads.types";

export const STAGE_META: Record<LeadStage, { label: string; hint: string; dot: string }> = {
  new: { label: "New · not assigned", hint: "Assign someone to call", dot: "bg-[#2F64A8]" },
  assigned: { label: "Assigned · to call", hint: "First call or retry", dot: "bg-[#7A8BA3]" },
  follow_up: { label: "Follow-up", hint: "Spoke to them, call back", dot: "bg-[#8E5BD0]" },
  consult_booked: { label: "Consult booked", hint: "Coming in for a consult", dot: "bg-[#F39A1E]" },
  plan_sent: { label: "Plan sent", hint: "Waiting on their decision", dot: "bg-[#1D5296]" },
};

export const CALL_RESULT_LABELS: Record<(typeof CALL_RESULTS)[number], string> = {
  no_answer: "No answer",
  busy: "Line busy",
  switched_off: "Phone switched off",
};

const dateTime = new Intl.DateTimeFormat("en-PH", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: CLINIC_TIME_ZONE });
const day = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: CLINIC_TIME_ZONE });
export const formatLeadTime = (d: Date) => dateTime.format(d);
export const formatLeadDay = (d: Date) => day.format(d);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "5 min ago", "3 h ago", "2 days ago". */
export function ago(d: Date, now = Date.now()): string {
  const ms = now - d.getTime();
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))} min ago`;
  if (ms < DAY) return `${Math.round(ms / HOUR)} h ago`;
  const days = Math.round(ms / DAY);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** What the card says about the next step: overdue, due today or later. */
export function nextLabel(next: Date | null, now = Date.now()): { text: string; overdue: boolean } | null {
  if (!next) return null;
  const overdue = next.getTime() < now;
  return { text: `${overdue ? "Overdue · was due" : "Call"} ${formatLeadTime(next)}`, overdue };
}
