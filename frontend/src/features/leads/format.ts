import { CLINIC_TIME_ZONE, addDays, clinicDateOf, clinicToday } from "@/config/clinic";
import type { CALL_RESULTS } from "@backend/features/leads/lead.schema";
import type { LeadCard, LeadStage } from "@backend/features/leads/leads.types";

export const STAGE_META: Record<LeadStage, { label: string; hint: string; dot: string }> = {
  new: { label: "New · not assigned", hint: "Assign a receptionist to call", dot: "bg-[#2F64A8]" },
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

const SOURCE_COLORS: Record<string, string> = {
  Facebook: "#1877F2",
  Messenger: "#0866FF",
  Instagram: "#C13584",
  Google: "#1E8E3E",
  Website: "#1D5296",
  TikTok: "#111111",
  Viber: "#7360F2",
  WhatsApp: "#1FA855",
  "Phone call": "#E08A12",
  "Walk-in": "#5E6B7E",
  Referral: "#2E9E63",
};
export const sourceColor = (name: string | undefined) => (name && SOURCE_COLORS[name]) || "#7A8BA3";

const dateTime = new Intl.DateTimeFormat("en-PH", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: CLINIC_TIME_ZONE });
const day = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: CLINIC_TIME_ZONE });
const dayMonth = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", timeZone: CLINIC_TIME_ZONE });
const time = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: CLINIC_TIME_ZONE });
export const formatLeadTime = (d: Date) => dateTime.format(d);
export const formatLeadDay = (d: Date) => day.format(d);
export const formatDayMonth = (d: Date) => dayMonth.format(d);

/** "Today, 9:12 AM", "Yesterday, 10:07 PM" or "31 Oct, 10:15 PM". */
export function whenLabel(d: Date, now = new Date()): string {
  const today = clinicToday(now);
  const date = clinicDateOf(d);
  const prefix = date === today ? "Today" : date === addDays(today, -1) ? "Yesterday" : dayMonth.format(d);
  return `${prefix}, ${time.format(d)}`;
}

const NEXT_ACTION: Record<LeadStage, string> = {
  new: "Call",
  assigned: "First call",
  follow_up: "Call back",
  consult_booked: "Consult",
  plan_sent: "Decision follow-up",
};

export type NextTone = "unassigned" | "due" | "later";

/** What the card says about the next step, and whether it needs doing today. */
export function nextStep(lead: Pick<LeadCard, "stage" | "assignee" | "nextActionAt">, now = new Date()): { text: string; tone: NextTone } {
  if (!lead.assignee) return { text: "Needs a receptionist to call", tone: "unassigned" };
  const next = lead.nextActionAt;
  if (!next) return { text: "No next step set", tone: "later" };
  const action = NEXT_ACTION[lead.stage];
  const date = clinicDateOf(next);
  const today = clinicToday(now);
  if (lead.stage === "consult_booked" || date > today) return { text: `${action} ${formatLeadTime(next)}`, tone: "later" };
  if (date < today) return { text: `Overdue · ${action.toLowerCase()} ${formatLeadTime(next)}`, tone: "due" };
  return { text: `${action} due today, ${time.format(next)}`, tone: "due" };
}
