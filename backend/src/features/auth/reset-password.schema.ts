import { z } from "zod";
import { emailSchema } from "./login.schema";
import { newPasswordSchema } from "./password.schema";

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

/** Tokens are 32 random bytes, base64url-encoded (43 chars). */
export const resetTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "This reset link is invalid or has expired");

export const resetPasswordSchema = z
  .object({
    token: resetTokenSchema,
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
