import { clinicToday } from "@/config/clinic";

export const LEAD_TABS = ["pipeline", "won", "lost"] as const;
export type LeadTab = (typeof LEAD_TABS)[number];

/** Everything the Leads screen shows is driven by the URL. */
export interface LeadsState {
  tab: LeadTab;
  source: string;
  who: string;
  q?: string;
  month: string;
  lead?: string;
  add?: boolean;
}

export interface LeadsSearchParams {
  tab?: string;
  source?: string;
  who?: string;
  q?: string;
  month?: string;
  lead?: string;
  add?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseLeadsState(p: LeadsSearchParams): LeadsState {
  const { tab = "", source = "", who = "", month = "", lead = "" } = p;
  return {
    tab: (LEAD_TABS as readonly string[]).includes(tab) ? (tab as LeadTab) : "pipeline",
    source: UUID.test(source) ? source : "all",
    who: UUID.test(who) || ["none", "due", "me"].includes(who) ? who : "all",
    q: p.q?.trim().slice(0, 100) || undefined,
    month: /^\d{4}-\d{2}$/.test(month) ? month : clinicToday().slice(0, 7),
    lead: UUID.test(lead) ? lead : undefined,
    add: p.add === "1",
  };
}

export function leadsHref(state: LeadsState, patch: Partial<LeadsState> = {}): string {
  const next = { ...state, ...patch };
  const params = new URLSearchParams();
  if (next.tab !== "pipeline") params.set("tab", next.tab);
  if (next.source !== "all") params.set("source", next.source);
  if (next.who !== "all") params.set("who", next.who);
  if (next.q) params.set("q", next.q);
  if (next.tab !== "pipeline" && next.month !== clinicToday().slice(0, 7)) params.set("month", next.month);
  if (next.lead) params.set("lead", next.lead);
  if (next.add) params.set("add", "1");
  const qs = params.toString();
  return qs ? `/leads?${qs}` : "/leads";
}

/** The month before or after "YYYY-MM". */
export function shiftMonth(month: string, step: -1 | 1): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + step, 1)).toISOString().slice(0, 7);
}
