"use server";

/**
 * Auth controller — the feature's entry layer (Server Actions called by the
 * auth forms). Responsibilities: authenticate the caller, hand raw input to
 * the services (which validate it), and translate the outcome into an
 * ActionResult / redirect. No business rules or database access here.
 */
import { AuthError, CredentialsSignin } from "next-auth";
import { safeCallbackUrl } from "@backend/config/security";
import { runAction, type ActionResult } from "@backend/lib/api/response";
import { signIn, signOut } from "@backend/lib/auth";
import { getCurrentUser, requireAuth } from "@backend/lib/authorization";
import { zodFieldErrors } from "@backend/lib/errors/api-error-handler";
import { ERROR_CODES } from "@backend/lib/errors/error-codes";
import { logger } from "@backend/lib/logging/logger";
import { getRequestContext } from "@backend/lib/request-context";
import { loginSchema } from "./login.schema";
import { changePassword, recordLogout, revokeAllSessions, updateProfile } from "./auth.service";
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  ProfileDto,
  ResetPasswordInput,
  UpdateProfileInput,
} from "./auth.types";
import { requestPasswordReset, resetPassword } from "./password-reset.service";

/**
 * Signs in and redirects. Returns an error result on failure; on success the
 * redirect thrown by Auth.js propagates to the client.
 */
export async function loginAction(input: LoginInput): Promise<ActionResult<never>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: ERROR_CODES.VALIDATION_ERROR.message, fields: zodFieldErrors(parsed.error) },
    };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      remember: parsed.data.remember ? "true" : "false",
      redirectTo: safeCallbackUrl(parsed.data.callbackUrl),
    });
  } catch (error) {
    const isCredentialsError =
      error instanceof CredentialsSignin || (error instanceof AuthError && error.type === "CredentialsSignin");
    if (isCredentialsError && (error as CredentialsSignin).code === "rate_limited") {
      return { success: false, error: { code: "RATE_LIMITED", message: "Too many sign-in attempts. Please wait 15 minutes and try again." } };
    }
    if (isCredentialsError) {
      return { success: false, error: { code: "UNAUTHENTICATED", message: "Invalid email or password." } };
    }
    if (error instanceof AuthError) {
      // e.g. database unreachable inside authorize(): do not blame the user's password.
      logger.error("Sign-in failed unexpectedly", { type: error.type, error: error.cause ?? error });
      return {
        success: false,
        error: { code: "DATABASE_ERROR", message: "Sign-in is temporarily unavailable. Please try again shortly." },
      };
    }
    throw error; // NEXT_REDIRECT on success
  }
  // Unreachable: signIn always redirects or throws.
  return { success: false, error: { code: "INTERNAL_ERROR", message: ERROR_CODES.INTERNAL_ERROR.message } };
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) await recordLogout(user);
  await signOut({ redirectTo: "/login" });
}

export async function forgotPasswordAction(input: ForgotPasswordInput): Promise<ActionResult> {
  return runAction(async () => {
    const { ipAddress } = await getRequestContext();
    await requestPasswordReset(input, ipAddress ?? "unknown");
    return undefined;
  }, "If an account exists for that email, a reset link is on its way.");
}

export async function resetPasswordAction(input: ResetPasswordInput): Promise<ActionResult> {
  return runAction(async () => {
    await resetPassword(input);
    return undefined;
  }, "Your password has been updated. Please sign in.");
}

/** Changing the password revokes every session, so the user signs in again. */
export async function changePasswordAction(input: ChangePasswordInput): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireAuth();
    await changePassword(user, input);
    await signOut({ redirectTo: "/login?reason=password-changed" });
    return undefined;
  });
}

export async function updateProfileAction(input: UpdateProfileInput): Promise<ActionResult<ProfileDto>> {
  return runAction(async () => updateProfile(await requireAuth(), input), "Profile updated.");
}

export async function revokeAllSessionsAction(): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireAuth();
    await revokeAllSessions(user);
    await signOut({ redirectTo: "/login?reason=signed-out-everywhere" });
    return undefined;
  });
}
