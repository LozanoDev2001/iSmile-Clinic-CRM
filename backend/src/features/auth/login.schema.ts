import { z } from "zod";

/** Normalised email: trimmed, lower-cased, bounded. Reused by every auth form. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .max(254, "Email is too long")
  .pipe(z.email("Enter a valid email address"));

/** Staff ID from `users.staff_code`, e.g. "FD-003". */
export const staffCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{1,31}$/, "Enter a valid staff ID");

export const loginSchema = z.object({
  /** "Email or staff ID": emails are lower-cased, staff codes (e.g. FD-003) upper-cased. */
  email: z
    .string()
    .trim()
    .min(1, "Enter your email or staff ID")
    .max(254, "Email is too long")
    .pipe(z.union([emailSchema, staffCodeSchema], "Enter a valid email or staff ID")),
  /** "Keep me signed in": longer absolute session lifetime (see lib/auth.config.ts). */
  remember: z.boolean().optional(),
  // No strength rules at login — only bound the length to protect the hasher.
  password: z.string().min(1, "Password is required").max(128, "Invalid email or password"),
  callbackUrl: z.string().max(2048).optional(),
});
