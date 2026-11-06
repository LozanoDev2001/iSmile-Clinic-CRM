import { z } from "zod";
import { SECURITY } from "@backend/config/security";

/**
 * Password policy (NIST SP 800-63B style): length over complexity rules,
 * reject whitespace-only and obviously weak values.
 */
const COMMON_PASSWORDS = new Set([
  "password1234",
  "123456789012",
  "qwertyuiopas",
  "ismile123456",
  "letmein12345",
  "welcome12345",
]);

export const newPasswordSchema = z
  .string()
  .min(SECURITY.password.minLength, `Use at least ${SECURITY.password.minLength} characters`)
  .max(SECURITY.password.maxLength, `Use at most ${SECURITY.password.maxLength} characters`)
  .refine((v) => v.trim().length === v.length, "Password cannot start or end with spaces")
  .refine((v) => new Set(v).size >= 5, "Password is too repetitive")
  .refine((v) => !COMMON_PASSWORDS.has(v.toLowerCase()), "This password is too common");

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required").max(SECURITY.password.maxLength),
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    path: ["newPassword"],
    message: "New password must differ from the current one",
  });

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120, "Name is too long"),
});
