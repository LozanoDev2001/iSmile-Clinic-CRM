import { MESSAGE_CHANNELS } from "@backend/features/patients/patient.schema";

export const SECTIONS = ["inbox", "birthdays", "broadcasts", "replies"] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = { inbox: "Inbox", birthdays: "Birthday greetings", broadcasts: "Broadcasts", replies: "Saved replies" };

/** What the Messaging screen shows is driven by the URL. */
export interface MessagingState {
  section: Section;
  channel: string;
  status: "open" | "done" | "all";
  who: string;
  q?: string;
  c?: string;
  log?: boolean;
}

export interface MessagingSearchParams {
  section?: string;
  channel?: string;
  status?: string;
  who?: string;
  q?: string;
  c?: string;
  log?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseMessagingState(p: MessagingSearchParams): MessagingState {
  const { section = "", channel = "", status = "", who = "", c = "" } = p;
  return {
    section: (SECTIONS as readonly string[]).includes(section) ? (section as Section) : "inbox",
    channel: (MESSAGE_CHANNELS as readonly string[]).includes(channel) ? channel : "all",
    status: status === "done" || status === "all" ? status : "open",
    who: UUID.test(who) || ["me", "none"].includes(who) ? who : "all",
    q: p.q?.trim().slice(0, 100) || undefined,
    c: UUID.test(c) ? c : undefined,
    log: p.log === "1",
  };
}

export function messagingHref(state: MessagingState, patch: Partial<MessagingState> = {}): string {
  const next = { ...state, ...patch };
  const params = new URLSearchParams();
  if (next.section !== "inbox") params.set("section", next.section);
  if (next.channel !== "all") params.set("channel", next.channel);
  if (next.status !== "open") params.set("status", next.status);
  if (next.who !== "all") params.set("who", next.who);
  if (next.q) params.set("q", next.q);
  if (next.c) params.set("c", next.c);
  if (next.log) params.set("log", "1");
  const qs = params.toString();
  return qs ? `/messaging?${qs}` : "/messaging";
}

export const DELIVERY_LABELS: Record<string, string> = {
  not_sent: "Not sent yet",
  sent_manually: "Sent from the app",
  simulated: "Delivered (simulated)",
};
