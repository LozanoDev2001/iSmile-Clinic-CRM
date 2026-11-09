import type { z } from "zod";
import type { NamedRef } from "@backend/features/patients/patients.types";
import type { BROADCAST_AUDIENCES, CONVERSATION_STATUSES, DELIVERY_STATUSES, broadcastSchema, incomingMessageSchema } from "./messaging.schema";
import type { TemplateValues } from "./messaging.templates";

export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];
export type IncomingMessageInput = z.input<typeof incomingMessageSchema>;
export type BroadcastInput = z.input<typeof broadcastSchema>;

export interface ConversationSummary {
  id: string;
  channel: string;
  status: ConversationStatus;
  contact: { id: string; name: string; contactType: string };
  assignee: NamedRef | null;
  lastMessageAt: Date | null;
  lastMessage: { body: string | null; direction: "in" | "out" } | null;
  /** The last message came from them, so it is waiting on the clinic. */
  needsReply: boolean;
}

export interface ChatMessage {
  id: string;
  direction: "in" | "out";
  body: string | null;
  sentAt: Date;
  kind: string;
  deliveryStatus: string | null;
  senderName: string | null;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ChatMessage[];
  contactPhone: string | null;
  contactEmail: string | null;
  patient: { id: string; patientNo: string } | null;
  openLead: { id: string; stage: string } | null;
  /** Values for {fill-ins} in saved replies. */
  fill: TemplateValues;
}

export interface SavedReply {
  title: string;
  body: string;
}

export interface Celebrant {
  patientId: string;
  contactId: string;
  name: string;
  patientNo: string;
  dob: string;
  turning: number;
  daysAway: number;
  channel: string | null;
  greeted: boolean;
}

export interface GreetingSent {
  messageId: string;
  name: string;
  channel: string;
  sentAt: Date;
  deliveryStatus: string | null;
}

export interface BroadcastSummary {
  id: string;
  title: string;
  audience: BroadcastAudience;
  recipientCount: number;
  createdAt: Date;
  createdBy: string | null;
}

export interface AudiencePreview {
  audience: BroadcastAudience;
  patients: number;
  reachable: number;
}
