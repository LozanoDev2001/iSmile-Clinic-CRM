import { z } from "zod";
import { MESSAGE_CHANNELS } from "@backend/features/patients/patient.schema";

export const CONTACT_TYPES = ["patient", "lead", "guardian", "partner", "other"] as const;
/** Types staff can create here; patients and leads come from their own modules. */
export const NEW_CONTACT_TYPES = ["partner", "other"] as const;

export const contactIdSchema = z.uuid("Invalid contact identifier");

const optionalText = (max: number) => z.string().trim().max(max).nullable().transform((v) => v || null);

export const contactInputSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the name").max(120),
  phone: optionalText(40).refine((v) => v === null || /^\+?[\d\s()-]{7,}$/.test(v), "Enter a valid phone number"),
  email: z.union([z.email("Enter a valid email"), z.literal(""), z.null()]).transform((v) => v || null),
  preferredChannel: z.union([z.enum(MESSAGE_CHANNELS), z.literal(""), z.null()]).transform((v) => v || null),
  address: optionalText(255),
});

export const newContactSchema = contactInputSchema.extend({ contactType: z.enum(NEW_CONTACT_TYPES) });

export const listContactsQuerySchema = z.object({
  type: z.union([z.enum(CONTACT_TYPES), z.literal("all")]).catch("all"),
  search: z.string().trim().max(100).optional().transform((v) => v || undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
