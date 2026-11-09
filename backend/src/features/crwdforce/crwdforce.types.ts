import type { z } from "zod";
import type { MIA_INTENTS, MIA_NEXT_STEPS, miaDraftOutputSchema, miaSettingsSchema } from "./crwdforce.schema";

export type MiaSettings = z.infer<typeof miaSettingsSchema>;
export type MiaSettingsInput = z.input<typeof miaSettingsSchema>;
export type MiaDraftOutput = z.infer<typeof miaDraftOutputSchema>;
export type MiaIntent = (typeof MIA_INTENTS)[number];
export type MiaNextStep = (typeof MIA_NEXT_STEPS)[number];

export const DEFAULT_MIA_SETTINGS: MiaSettings = {
  name: "Mia",
  tone: "warm",
  languages: ["English", "Filipino", "Taglish"],
  greeting: "Hi there! I'm Mia from the clinic. I can help you book a visit, answer questions about our treatments, and help the whole family. How can I help you today?",
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

export interface CrwdforceConsole {
  status: MiaStatus;
  waiting: { conversationId: string; name: string; channel: string; lastMessage: string | null; lastMessageAt: Date | null; draft: MiaDraft | null }[];
  today: { drafts: number; used: number; dismissed: number; handovers: number };
}

/** A real open appointment the model may suggest, by its short id. */
export interface SlotOption {
  id: string;
  label: string;
}
