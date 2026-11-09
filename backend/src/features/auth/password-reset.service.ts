import "server-only";
import { SECURITY } from "@backend/config/security";
import { Errors } from "@backend/lib/errors/app-error";
import { sendEmail } from "@backend/lib/email/mailer";
import { env } from "@backend/lib/env";
import { AUDIT_ACTIONS, audit } from "@backend/lib/logging/audit";
import { logger, logSecurityEvent } from "@backend/lib/logging/logger";
import { prisma, type TransactionClient } from "@backend/lib/prisma";
import { generateToken, hashPassword, hashToken } from "@backend/lib/security/password";
import { rateLimitKey, rateLimiter } from "@backend/lib/security/rate-limit";
import { forgotPasswordSchema, resetPasswordSchema, resetTokenSchema } from "./reset-password.schema";
import { authRepository } from "./auth.repository";
import type { ForgotPasswordInput, ResetPasswordInput } from "./auth.types";

const INVALID_LINK = "This reset link is invalid or has expired. Please request a new one.";

/** Reset and invite links only work for accounts that are invited or active (not locked or disabled). */
const linkUsable = (status: string) => status === "invited" || status === "active";

function resetUrl(token: string) {
  return `${env.APP_URL.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Starts a password reset. Always resolves the same way whether or not the
 * account exists (no enumeration). Rate-limited per IP and per email.
 */
export async function requestPasswordReset(input: ForgotPasswordInput, ipAddress: string): Promise<void> {
  const { email } = forgotPasswordSchema.parse(input);
  await rateLimiter.enforce(rateLimitKey("reset-ip", ipAddress), SECURITY.rateLimits.passwordResetPerIp);

  const emailLimit = await rateLimiter.check(rateLimitKey("reset-email", email), SECURITY.rateLimits.passwordResetPerEmail);
  if (!emailLimit.allowed) {
    // Silently drop: telling the caller would reveal that the address is being targeted.
    logSecurityEvent("password_reset_rate_limited", { ipAddress });
    return;
  }

  const user = await authRepository.findActiveUserByEmail(email);
  if (!user) {
    logger.info("Password reset requested for unknown or inactive account", { ipAddress });
    return;
  }

  // Email failures are logged inside; the caller still sees the generic confirmation.
  await sendPasswordResetEmail({ ...user, name: user.fullName }, user.id);
}

/**
 * Issues a single-use reset link and emails it. `actorId` is who asked: the
 * user themself, or an owner/manager from Settings. Returns false if the email failed.
 */
export async function sendPasswordResetEmail(
  user: { id: string; email: string; name: string; clinicId: string },
  actorId: string,
): Promise<boolean> {
  const { token, tokenHash } = generateToken();
  const expiresAt = new Date(Date.now() + SECURITY.passwordReset.tokenTtlMinutes * 60_000);
  await authRepository.createPasswordToken(user.id, tokenHash, "reset", expiresAt);

  let sent = true;
  try {
    await sendEmail({
      to: user.email,
      subject: "Reset your iSmile CRM password",
      text:
        `Hello ${user.name},\n\nUse the link below to choose a new password. ` +
        `It expires in ${SECURITY.passwordReset.tokenTtlMinutes} minutes and can be used once.\n\n` +
        `${resetUrl(token)}\n\nIf you did not request this, you can ignore this email.`,
    });
  } catch (error) {
    sent = false;
    logger.error("Password reset email failed", { userId: user.id, error });
  }

  await audit({
    action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
    resourceType: "user",
    resourceId: user.id,
    actorId,
    clinicId: user.clinicId,
  });
  return sent;
}

/** True when the token exists, is unused and unexpired (for rendering the form). */
export async function isResetTokenValid(token: string): Promise<boolean> {
  const parsed = resetTokenSchema.safeParse(token);
  if (!parsed.success) return false;
  const record = await authRepository.findValidToken(hashToken(parsed.data));
  return !!record && linkUsable(record.user.status);
}

/**
 * Completes a reset or invitation: sets the password, consumes the token
 * (single use, race-safe), invalidates other tokens and revokes all sessions.
 */
export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const { token, password } = resetPasswordSchema.parse(input);
  const record = await authRepository.findValidToken(hashToken(token));
  if (!record || !linkUsable(record.user.status)) {
    logSecurityEvent("password_reset_invalid_token");
    throw Errors.validation({ token: [INVALID_LINK] }, INVALID_LINK);
  }

  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    if (!(await authRepository.consumeToken(record.id, tx))) {
      throw Errors.validation({ token: [INVALID_LINK] }, INVALID_LINK);
    }
    await authRepository.setPassword(record.userId, passwordHash, tx);
    await authRepository.invalidateUserTokens(record.userId, tx);
    await audit(
      {
        action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
        resourceType: "user",
        resourceId: record.userId,
        actorId: record.userId,
        clinicId: record.user.clinicId,
        metadata: { purpose: record.purpose },
      },
      tx,
    );
  });
}

/** Issues an invitation token for a newly created user. Returns the raw token. */
export async function createInviteToken(userId: string, tx: TransactionClient): Promise<string> {
  const { token, tokenHash } = generateToken();
  const expiresAt = new Date(Date.now() + SECURITY.invite.tokenTtlHours * 3_600_000);
  await authRepository.createPasswordToken(userId, tokenHash, "invite", expiresAt, tx);
  return token;
}

export async function sendInviteEmail(to: { email: string; name: string }, token: string): Promise<void> {
  await sendEmail({
    to: to.email,
    subject: "You have been invited to iSmile CRM",
    text:
      `Hello ${to.name},\n\nAn account has been created for you on iSmile CRM. ` +
      `Set your password using the link below (valid for ${SECURITY.invite.tokenTtlHours} hours):\n\n` +
      `${resetUrl(token)}\n`,
  });
}
