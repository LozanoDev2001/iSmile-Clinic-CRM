import type { z } from "zod";
import type { NamedRef } from "@backend/features/patients/patients.types";
import type { LEAD_STAGES, LEAD_STATUSES, createLeadSchema, leadActionSchema } from "./lead.schema";

export type LeadStage = (typeof LEAD_STAGES)[number];
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type CreateLeadInput = z.input<typeof createLeadSchema>;
export type LeadActionInput = z.input<typeof leadActionSchema>;

export interface LeadCard {
  id: string;
  name: string;
  phone: string | null;
  stage: LeadStage;
  status: LeadStatus;
  hot: boolean;
  source: NamedRef | null;
  interest: NamedRef | null;
  assignee: NamedRef | null;
  nextActionAt: Date | null;
  attempts: number;
  createdAt: Date;
  closedAt: Date | null;
  closedReason: string | null;
  wonValue: number | null;
}

export interface LeadActivityEntry {
  id: string;
  type: string;
  content: string | null;
  actorName: string | null;
  occurredAt: Date;
}

export interface LeadDetail extends LeadCard {
  contactId: string;
  email: string | null;
  preferredChannel: string | null;
  message: string | null;
  patient: { id: string; patientNo: string } | null;
  appointment: { id: string; startsAt: Date; status: string } | null;
  activities: LeadActivityEntry[];
}

export interface LeadBoard {
  columns: Record<LeadStage, LeadCard[]>;
  openCount: number;
  hotCount: number;
  unassignedCount: number;
  dueCount: number;
  wonThisMonth: number;
  wonValueThisMonth: number;
  sources: (NamedRef & { open: number })[];
}

export interface ClosedLeads {
  leads: LeadCard[];
  total: number;
  value: number;
  reasons: { reason: string; count: number }[];
}

export interface LeadOptions {
  staff: NamedRef[];
  sources: NamedRef[];
  services: (NamedRef & { price: number; durationMinutes: number | null })[];
  dentists: NamedRef[];
}
