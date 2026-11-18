import { z } from "zod";
import { MESSAGE_CHANNELS } from "@backend/features/patients/patient.schema";

/** Open stages, in pipeline order. Won and lost leads keep the stage they reached. */
export const LEAD_STAGES = ["new", "assigned", "follow_up", "consult_booked", "plan_sent"] as const;
export const LEAD_STATUSES = ["open", "won", "lost"] as const;
export const CALL_RESULTS = ["no_answer", "busy", "switched_off"] as const;

export const FOLLOW_UP_REASONS = [
  "Wants to check the budget first",
  "Will discuss with family",
  "Asked us to call back after payday",
  "Comparing two clinics",
  "Will check their schedule",
  "Waiting for HMO approval",
  "Busy, asked us to call later",
] as const;

export const LOST_REASONS = [
  "No answer after 3 attempts",
  "Wrong number or spam",
  "Duplicate lead",
  "Just asking, not ready",
  "Price or budget",
  "Chose another clinic",
  "Too far from the clinic",
  "HMO not accepted",
  "Postponed treatment",
  "No-show, did not rebook",
] as const;

export const leadIdSchema = z.uuid("Invalid lead identifier");

const optionalText = (max: number) => z.string().trim().max(max).nullable().transform((v) => v || null);
const optionalId = z.union([z.uuid(), z.literal(""), z.null()]).transform((v) => v || null);
const futureInstant = z.coerce.date({ error: "Pick a date and time" });

export const createLeadSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter the person's name").max(120),
    phone: optionalText(40).refine((v) => v === null || /^\+?[\d\s()-]{7,}$/.test(v), "Enter a valid phone number"),
    email: z.union([z.email("Enter a valid email"), z.literal(""), z.null()]).transform((v) => v || null),
    preferredChannel: z.union([z.enum(MESSAGE_CHANNELS), z.literal(""), z.null()]).transform((v) => v || null),
    sourceId: optionalId,
    interestedServiceId: optionalId,
    message: optionalText(2000),
    hot: z.boolean(),
    assigneeId: optionalId,
  })
  .refine((v) => v.phone || v.email, { message: "Enter a mobile number or an email so the team can reach them", path: ["phone"] });

const withNote = { note: z.string().trim().max(500).nullish().transform((v) => v || null) };

/** One step on the pipeline. Each carries who is handling the lead. */
export const leadActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("assign"), assigneeId: z.uuid("Choose who will call"), nextAt: futureInstant, ...withNote }),
  z.object({ type: z.literal("retry"), assigneeId: z.uuid("Choose who will call"), result: z.enum(CALL_RESULTS), nextAt: futureInstant, ...withNote }),
  z.object({ type: z.literal("follow_up"), assigneeId: z.uuid("Choose who will call"), reason: z.enum(FOLLOW_UP_REASONS), nextAt: futureInstant, ...withNote }),
  z.object({
    type: z.literal("book_consult"),
    assigneeId: z.uuid("Choose who will call"),
    serviceId: optionalId,
    dentistId: z.uuid("Choose a dentist"),
    date: z.iso.date(),
    startMinutes: z.number().int(),
    durationMinutes: z.number().int(),
    ...withNote,
  }),
  z.object({ type: z.literal("plan_sent"), assigneeId: z.uuid("Choose who will call"), serviceId: z.uuid("Choose the treatment in the plan"), nextAt: futureInstant, ...withNote }),
  z.object({ type: z.literal("won"), assigneeId: z.uuid("Choose who will call"), serviceId: z.uuid("Choose the accepted treatment"), ...withNote }),
  z.object({ type: z.literal("lost"), assigneeId: z.uuid("Choose who will call"), reason: z.enum(LOST_REASONS, "Pick a reason"), ...withNote }),
  z.object({ type: z.literal("reopen"), assigneeId: z.uuid("Choose who will call"), nextAt: futureInstant, ...withNote }),
  z.object({ type: z.literal("note"), note: z.string().trim().min(2, "Write the note").max(500) }),
]);

export const boardQuerySchema = z.object({
  source: z.union([z.uuid(), z.literal("all")]).catch("all"),
  who: z.union([z.uuid(), z.enum(["all", "none", "due", "me"])]).catch("all"),
  search: z.string().trim().max(100).optional().transform((v) => v || undefined),
});

export const closedQuerySchema = z.object({
  status: z.enum(["won", "lost"]).catch("won"),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional().catch(undefined),
});
