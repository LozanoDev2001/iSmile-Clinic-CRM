import type { z } from "zod";
import type { Role } from "@backend/config/permissions";
import type { loginSchema } from "./login.schema";
import type { changePasswordSchema, updateProfileSchema } from "./password.schema";
import type { forgotPasswordSchema, resetPasswordSchema } from "./reset-password.schema";

// ─── Inputs (derived from the Zod schemas, so types and validation never drift) ─

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ─── Outputs / DTOs ─────────────────────────────────────────────────────────

/** What a successful credential check hands to Auth.js. Never includes the password hash. */
export interface AuthenticatedIdentity {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/** Returned by startSession(): the raw secret is stored only in the session cookie. */
export interface StartedSession {
  sessionId: string;
  sessionSecret: string;
}

export type CredentialsResult =
  | { ok: true; user: AuthenticatedIdentity }
  | { ok: false; reason: "invalid_credentials" | "rate_limited" };

export interface ProfileDto {
  name: string;
}
