import { z } from "zod";
import { MESSAGE_CHANNELS } from "@backend/features/patients/patient.schema";

export const CONVERSATION_STATUSES = ["open", "done"] as const;
export const BROADCAST_AUDIENCES = [
  "all",
  "kids",
  "seniors",
  "birthdays_month",
  "recall",
] as const;
/** How an outgoing message left the clinic. Real connectors will add "sent" and "delivered". */
export const DELIVERY_STATUSES = [
  "not_sent",
  "sent_manually",
  "simulated",
] as const;

const MAX_BODY = 2000;

export const conversationIdSchema = z.uuid("Invalid conversation identifier");
export const messageIdSchema = z.uuid("Invalid message identifier");

export const inboxQuerySchema = z.object({
  channel: z.union([z.enum(MESSAGE_CHANNELS), z.literal("all")]).catch("all"),
  status: z
    .union([z.enum(CONVERSATION_STATUSES), z.literal("all")])
    .catch("open"),
  who: z.union([z.uuid(), z.enum(["all", "me", "none"])]).catch("all"),
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
});

const body = z
  .string()
  .trim()
  .min(1, "Write a message")
  .max(MAX_BODY, `Keep it under ${MAX_BODY} characters`);

export const replySchema = z.object({ body });

/** An incoming message, logged by staff or (in development) simulated. Real webhooks will feed the same intake. */
export const incomingMessageSchema = z
  .object({
    channel: z.enum(MESSAGE_CHANNELS),
    name: z.string().trim().min(2, "Enter their name").max(120),
    phone: z
      .string()
      .trim()
      .max(40)
      .nullable()
      .transform((v) => v || null)
      .refine(
        (v) => v === null || /^\+?[\d\s()-]{7,}$/.test(v),
        "Enter a valid phone number",
      ),
    email: z
      .union([z.email("Enter a valid email"), z.literal(""), z.null()])
      .transform((v) => v || null),
    body,
  })
  .refine((m) => m.phone || m.email, {
    message: "Enter their mobile number or email",
    path: ["phone"],
  });

export const assignSchema = z.object({
  assigneeId: z.union([z.uuid(), z.null()]),
});
export const statusSchema = z.object({ status: z.enum(CONVERSATION_STATUSES) });

export const savedRepliesSchema = z
  .array(
    z.object({
      title: z.string().trim().min(2, "Give it a short title").max(60),
      body: z.string().trim().min(2, "Write the reply").max(MAX_BODY),
    }),
  )
  .max(40, "Keep it to 40 saved replies");

export const greetingSchema = z.object({
  body: z.string().trim().min(5, "Write the greeting").max(MAX_BODY),
});

export const broadcastSchema = z.object({
  title: z.string().trim().min(3, "Give the broadcast a title").max(120),
  body,
  audience: z.enum(BROADCAST_AUDIENCES),
});
