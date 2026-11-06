import { z } from "zod";

/** Normalised email: trimmed, lower-cased, bounded. Reused by every auth form. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .max(254, "Email is too long")
  .pipe(z.email("Enter a valid email address"));

export const loginSchema = z.object({
  // The login field is labelled "Email or staff ID"; staff IDs are not supported yet.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Enter your email or staff ID")
    .max(254, "Email is too long")
    .pipe(z.email("Staff ID sign-in is coming soon. Please use your email for now.")),
  /** "Keep me signed in": longer absolute session lifetime (see lib/auth.config.ts). */
  remember: z.boolean().optional(),
  // No strength rules at login — only bound the length to protect the hasher.
  password: z.string().min(1, "Password is required").max(128, "Invalid email or password"),
  callbackUrl: z.string().max(2048).optional(),
});
