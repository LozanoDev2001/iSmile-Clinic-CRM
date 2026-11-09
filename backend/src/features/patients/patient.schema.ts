import { z } from "zod";

export const patientIdSchema = z.uuid("Invalid patient identifier");

export const PATIENT_FILTERS = ["all", "kids", "seniors", "birthdays"] as const;
export const SEXES = ["female", "male"] as const;
export const CIVIL_STATUSES = ["single", "married", "widowed", "separated"] as const;
export const MESSAGE_CHANNELS = ["viber", "messenger", "whatsapp", "instagram", "sms", "email"] as const;

export const listPatientsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).optional().transform((v) => v || undefined),
  filter: z.enum(PATIENT_FILTERS).catch("all"),
});

// Optional fields accept "" or null and store NULL, so the server can re-parse the client's already-parsed values.

/** Optional free text: trimmed, and stored as NULL when left empty. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters`)
    .nullable()
    .transform((v) => v || null);

const optionalChoice = <T extends readonly [string, ...string[]]>(values: T) =>
  z.union([z.enum(values), z.literal(""), z.null()]).transform((v) => v || null);

const optionalId = z.union([z.uuid(), z.literal(""), z.null()]).transform((v) => v || null);

const phone = optionalText(40).refine((v) => v === null || /^\+?[\d\s()-]{7,}$/.test(v), "Enter a valid phone number");

const dateOfBirth = z
  .union([z.iso.date("Enter a valid date"), z.literal(""), z.null()])
  .transform((v) => v || null)
  .refine((v) => v === null || (v >= "1900-01-01" && new Date(`${v}T00:00:00Z`) <= new Date()), "Date of birth can't be in the future");

export const patientInputSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter the patient's full name").max(120),
    dob: dateOfBirth,
    sex: optionalChoice(SEXES),
    civilStatus: optionalChoice(CIVIL_STATUSES),
    occupation: optionalText(120),
    phone,
    email: z.union([z.email("Enter a valid email"), z.literal(""), z.null()]).transform((v) => v || null),
    address: optionalText(255),
    preferredChannel: optionalChoice(MESSAGE_CHANNELS),
    primaryDentistId: optionalId,
    payerId: optionalId,
    hmoMemberNo: optionalText(60),
    scPwdId: optionalText(60),
    emergencyName: optionalText(120),
    emergencyRelationship: optionalText(60),
    emergencyPhone: phone,
  })
  .refine((v) => v.emergencyName || (!v.emergencyRelationship && !v.emergencyPhone), {
    message: "Enter the emergency contact's name",
    path: ["emergencyName"],
  })
  .refine((v) => v.payerId || !v.hmoMemberNo, { message: "Choose the HMO first", path: ["payerId"] });

/** Clinical fields, only for roles with `patients.medical.update`. */
export const patientClinicalSchema = z.object({
  allergies: optionalText(2000),
  medicalConditions: optionalText(2000),
  medications: optionalText(2000),
});
