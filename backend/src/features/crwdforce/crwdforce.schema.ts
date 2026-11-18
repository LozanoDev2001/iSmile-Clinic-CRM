import { z } from "zod";

export const MIA_TONES = ["friendly", "warm", "formal"] as const;
export const MIA_LANGUAGES = [
  "English",
  "Filipino",
  "Taglish",
  "Cebuano",
] as const;
export const MIA_INTENTS = [
  "booking",
  "reschedule",
  "cancellation",
  "pricing",
  "hours_location",
  "treatment_question",
  "emergency",
  "complaint",
  "billing",
  "other",
] as const;
export const MIA_NEXT_STEPS = [
  "book",
  "reschedule",
  "follow_up",
  "handover",
  "none",
] as const;
export const DRAFT_DECISIONS = ["used", "dismissed"] as const;

export const draftIdSchema = z.uuid("Invalid draft identifier");

export const miaSettingsSchema = z.object({
  name: z.string().trim().min(2, "Give Mia a name").max(40),
  role: z.string().trim().max(80).default(""),
  tone: z.enum(MIA_TONES),
  languages: z
    .array(z.enum(MIA_LANGUAGES))
    .min(1, "Pick at least one language"),
  greeting: z.string().trim().min(5, "Write the opening greeting").max(500),
  knowledge: z
    .string()
    .trim()
    .max(8000, "Keep what Mia knows under 8,000 characters"),
  handoverNotes: z.string().trim().max(2000),
});

/** What Claude must return for each draft (also sent to the API as the JSON schema). */
export const miaDraftOutputSchema = z.object({
  reply: z.string().min(1).max(2000),
  summary: z.string().min(1).max(300),
  intent: z.enum(MIA_INTENTS),
  next_step: z.enum(MIA_NEXT_STEPS),
  slot_id: z.string().max(10),
  handover: z.boolean(),
  handover_reason: z.string().max(255),
});

export const draftDecisionSchema = z.object({
  decision: z.enum(DRAFT_DECISIONS),
});
