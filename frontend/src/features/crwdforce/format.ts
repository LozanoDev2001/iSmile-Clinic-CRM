import type {
  ConsoleConversation,
  MiaDraft,
} from "@backend/features/crwdforce/crwdforce.types";

export const INTENT_LABELS: Record<MiaDraft["intent"], string> = {
  booking: "Booking",
  reschedule: "Reschedule",
  cancellation: "Cancellation",
  pricing: "Prices",
  hours_location: "Hours & location",
  treatment_question: "Treatment question",
  emergency: "Emergency",
  complaint: "Complaint",
  billing: "Billing",
  other: "Other",
};

export const NEXT_STEP_LABELS: Record<MiaDraft["nextStep"], string> = {
  book: "Book a visit",
  reschedule: "Move their visit",
  follow_up: "Follow up",
  handover: "Hand over to the team",
  none: "No action needed",
};

export type Priority = "High" | "Mid" | "Low";
export type ConsoleFilter = "all" | "staff";
export const CONSOLE_TABS = [
  "conversation",
  "summary",
  "details",
  "history",
] as const;
export type ConsoleTab = (typeof CONSOLE_TABS)[number];

export function consoleHref(
  filter: ConsoleFilter,
  c?: string,
  tab?: ConsoleTab,
) {
  const q = new URLSearchParams();
  if (filter !== "all") q.set("filter", filter);
  if (c) q.set("c", c);
  if (tab && tab !== "conversation") q.set("tab", tab);
  const s = q.toString();
  return s ? `/crwdforce?${s}` : "/crwdforce";
}

const URGENT: MiaDraft["intent"][] = ["emergency", "complaint"];

/** High when Mia flags it for a person or it's urgent, Mid while it waits for a reply, Low otherwise. */
export function priorityOf(
  c: Pick<ConsoleConversation, "needsReply" | "draft">,
): Priority {
  if (c.draft && (c.draft.handover || URGENT.includes(c.draft.intent)))
    return "High";
  return c.needsReply ? "Mid" : "Low";
}

export function statusOf(
  c: Pick<ConsoleConversation, "needsReply" | "draft" | "assignee">,
): string {
  if (c.draft?.handover) return "Needs a person";
  if (c.draft)
    return c.draft.slotLabel
      ? `Mia offered ${c.draft.slotLabel.split(" with ")[0]}`
      : "Mia's draft ready";
  if (c.needsReply)
    return c.assignee
      ? `Waiting for ${c.assignee.split(" ")[0]}`
      : "Waiting for staff";
  return "Answered";
}

/** "Needs staff" keeps chats Mia flagged for a person and ones waiting without a draft. */
export function filterConversations<
  T extends Pick<ConsoleConversation, "needsReply" | "draft">,
>(list: T[], filter: "all" | "staff"): T[] {
  return filter === "staff"
    ? list.filter((c) => priorityOf(c) === "High" || (c.needsReply && !c.draft))
    : list;
}

/** The chat shown in the console: the one in the URL, else the first in the current filter. */
export function selectedConversationId(
  list: ConsoleConversation[],
  filter: "all" | "staff",
  requested: string | undefined,
): string | null {
  return (
    requested ?? filterConversations(list, filter)[0]?.conversationId ?? null
  );
}

export const PRIORITY_CLASSES: Record<Priority, string> = {
  High: "bg-[#FDECEA] text-[#A1301F]",
  Mid: "bg-[#DCEAFB] text-[#1D5296]",
  Low: "bg-[#DDF3E4] text-[#1E5B33]",
};

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

const RECENT_MS = 60 * 60 * 1000;

/** Whether they messaged in the last hour (shown as a green "active" dot). */
export function messagedRecently(at: Date | null): boolean {
  return !!at && Date.now() - at.getTime() < RECENT_MS;
}
