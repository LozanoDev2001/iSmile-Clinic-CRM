import "server-only";
import { SECURITY } from "@backend/config/security";
import { Errors } from "@backend/lib/errors/app-error";
import { AUDIT_ACTIONS, audit } from "@backend/lib/logging/audit";
import { logSecurityEvent } from "@backend/lib/logging/logger";
import { prisma } from "@backend/lib/prisma";
import { hashPassword, verifyPassword } from "@backend/lib/security/password";
import { rateLimitKey, rateLimiter } from "@backend/lib/security/rate-limit";
import type { AuthUser } from "@backend/lib/authorization";
import { loginSchema } from "./login.schema";
import { changePasswordSchema, updateProfileSchema } from "./password.schema";
import { authRepository } from "./auth.repository";
import type { ChangePasswordInput, CredentialsResult, ProfileDto, UpdateProfileInput } from "./auth.types";

/**
 * Verifies email + password. Called from the Auth.js Credentials provider.
 * Every failure looks the same to the caller ("invalid_credentials") so the
 * response never reveals whether an account exists or is disabled.
 */
export async function verifyCredentials(raw: unknown, ipAddress: string): Promise<CredentialsResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid_credentials" };
  const { email, password } = parsed.data;

  const emailKey = rateLimitKey("login-email", email);
  const [byIp, byEmail] = await Promise.all([
    rateLimiter.check(rateLimitKey("login-ip", ipAddress), SECURITY.rateLimits.loginPerIp),
    rateLimiter.check(emailKey, SECURITY.rateLimits.loginPerEmail),
  ]);
  if (!byIp.allowed || !byEmail.allowed) {
    logSecurityEvent("login_rate_limited", { ipAddress });
    return { ok: false, reason: "rate_limited" };
  }

  const user = await authRepository.findCredentialsByEmail(email);
  // Always run the hash check (dummy hash for unknown users) for constant timing.
  const passwordValid = await verifyPassword(user?.passwordHash, password);
  const accountUsable = !!user && user.isActive && (user.clinic?.isActive ?? true);

  if (!user || !passwordValid || !accountUsable) {
    logSecurityEvent("login_failed", {
      ipAddress,
      userId: user?.id,
      reason: !user ? "unknown_account" : !passwordValid ? "bad_password" : "account_disabled",
    });
    if (user) {
      await audit({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        resourceType: "user",
        resourceId: user.id,
        actorId: user.id,
        metadata: { reason: passwordValid ? "account_disabled" : "bad_password" },
      });
    }
    return { ok: false, reason: "invalid_credentials" };
  }

  await Promise.all([rateLimiter.reset(emailKey), authRepository.recordLogin(user.id)]);
  await audit({ action: AUDIT_ACTIONS.LOGIN_SUCCEEDED, resourceType: "user", resourceId: user.id, actorId: user.id });

  return {
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, sessionVersion: user.sessionVersion },
  };
}

/** Changes the password and revokes all sessions (including the current one). */
export async function changePassword(user: AuthUser, input: ChangePasswordInput): Promise<void> {
  const data = changePasswordSchema.parse(input);
  await rateLimiter.enforce(rateLimitKey("password-change", user.id), SECURITY.rateLimits.passwordChangePerUser);

  const current = await authRepository.findPasswordHash(user.id);
  if (!(await verifyPassword(current?.passwordHash, data.currentPassword))) {
    logSecurityEvent("password_change_failed", { userId: user.id });
    throw Errors.validation({ currentPassword: ["Current password is incorrect"] });
  }

  const passwordHash = await hashPassword(data.newPassword);
  await prisma.$transaction(async (tx) => {
    await authRepository.setPassword(user.id, passwordHash, tx);
    await authRepository.invalidateUserTokens(user.id, tx);
    await audit(
      { action: AUDIT_ACTIONS.PASSWORD_CHANGED, resourceType: "user", resourceId: user.id, actorId: user.id, clinicId: user.clinicId },
      tx,
    );
  });
}

export async function updateProfile(user: AuthUser, input: UpdateProfileInput): Promise<ProfileDto> {
  const data = updateProfileSchema.parse(input);
  const updated = await authRepository.updateProfile(user.id, data);
  await audit({
    action: AUDIT_ACTIONS.PROFILE_UPDATED,
    resourceType: "user",
    resourceId: user.id,
    actorId: user.id,
    clinicId: user.clinicId,
    metadata: { changedFields: ["name"] },
  });
  return { name: updated.name };
}

export async function recordLogout(user: AuthUser): Promise<void> {
  await audit({ action: AUDIT_ACTIONS.LOGOUT, resourceType: "user", resourceId: user.id, actorId: user.id, clinicId: user.clinicId });
}

/** "Sign out everywhere": every issued session token stops working. */
export async function revokeAllSessions(user: AuthUser): Promise<void> {
  await authRepository.revokeSessions(user.id);
  await audit({
    action: AUDIT_ACTIONS.SESSIONS_REVOKED,
    resourceType: "user",
    resourceId: user.id,
    actorId: user.id,
    clinicId: user.clinicId,
  });
}
