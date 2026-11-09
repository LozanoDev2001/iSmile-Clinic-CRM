import type { z } from "zod";
import type { ClinicProfile } from "@backend/features/settings/settings.types";
import type {
  MIA_INTENTS,
  MIA_NEXT_STEPS,
  miaDraftOutputSchema,
  miaSettingsSchema,
} from "./crwdforce.schema";

export type MiaSettings = z.infer<typeof miaSettingsSchema>;
export type MiaSettingsInput = z.input<typeof miaSettingsSchema>;
export type MiaDraftOutput = z.infer<typeof miaDraftOutputSchema>;
export type MiaIntent = (typeof MIA_INTENTS)[number];
export type MiaNextStep = (typeof MIA_NEXT_STEPS)[number];

export const DEFAULT_MIA_SETTINGS: MiaSettings = {
  name: "Mia",
  role: "Virtual front desk",
  tone: "warm",
  languages: ["English", "Filipino", "Taglish"],
  greeting:
    "Hi there! I'm Mia from the clinic. I can help you book a visit, answer questions about our treatments, and help the whole family. How can I help you today?",
  knowledge: "",
  handoverNotes: "",
};

export interface MiaDraft {
  id: string;
  conversationId: string;
  reply: string;
  summary: string;
  intent: MiaIntent;
  nextStep: MiaNextStep;
  slotLabel: string | null;
  handover: boolean;
  handoverReason: string | null;
  status: "pending" | "used" | "dismissed";
  createdAt: Date;
  createdBy: string | null;
}

export interface MiaStatus {
  connected: boolean;
  model: string;
}

export interface ConsoleConversation {
  conversationId: string;
  name: string;
  channel: string;
  lastMessage: string | null;
  lastMessageAt: Date | null;
  needsReply: boolean;
  assignee: string | null;
  draft: MiaDraft | null;
}

export interface CrwdforceConsole {
  status: MiaStatus;
  /** Open conversations, newest first. */
  conversations: ConsoleConversation[];
  today: { chats: number; waiting: number; used: number; handovers: number };
}

/** Something Mia draws on, with how current it is. */
export interface MiaSource {
  title: string;
  detail: string;
  status: "ok" | "live" | "needs" | "soon";
  statusLabel: string;
}

/** A real open appointment the model may suggest, by its short id. */
export interface SlotOption {
  id: string;
  label: string;
}

export interface MiaSetup {
  settings: MiaSettings;
  sources: MiaSource[];
  hours: ClinicProfile["hours"];
}
