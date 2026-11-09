import "server-only";
import { isRole } from "@backend/config/permissions";
import { SECURITY } from "@backend/config/security";
import { signInRulesFrom } from "@backend/features/settings/settings.types";
import { sessionLifetimeSeconds } from "@backend/lib/auth.config";
import { Errors } from "@backend/lib/errors/app-error";
import { AUDIT_ACTIONS, audit } from "@backend/lib/logging/audit";
import { logSecurityEvent } from "@backend/lib/logging/logger";
import { prisma } from "@backend/lib/prisma";
import { generateToken, hashPassword, verifyPassword } from "@backend/lib/security/password";
import { rateLimitKey, rateLimiter } from "@backend/lib/security/rate-limit";
import type { AuthUser } from "@backend/lib/authorization";
import { loginSchema } from "./login.schema";
import { changePasswordSchema, updateProfileSchema } from "./password.schema";
import { authRepository } from "./auth.repository";
import type { ChangePasswordInput, CredentialsResult, ProfileDto, StartedSession, UpdateProfileInput } from "./auth.types";

/** Audit actions after which the wrong-password count starts again. */
const LOCK_RESET_ACTIONS = [AUDIT_ACTIONS.LOGIN_SUCCEEDED, AUDIT_ACTIONS.USER_UNLOCKED, AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED];

/**
 * Verifies an email or staff ID plus password. Called from the Auth.js
 * Credentials provider. Every failure looks the same to the caller
 * ("invalid_credentials") so the response never reveals whether an account
 * exists, is disabled or is locked.
 */
export async function verifyCredentials(raw: unknown, ipAddress: string): Promise<CredentialsResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid_credentials" };
  const { email: identifier, password } = parsed.data;

  const identifierKey = rateLimitKey("login-email", identifier);
  const [byIp, byIdentifier] = await Promise.all([
    rateLimiter.check(rateLimitKey("login-ip", ipAddress), SECURITY.rateLimits.loginPerIp),
    rateLimiter.check(identifierKey, SECURITY.rateLimits.loginPerEmail),
  ]);
  if (!byIp.allowed || !byIdentifier.allowed) {
    logSecurityEvent("login_rate_limited", { ipAddress });
    return { ok: false, reason: "rate_limited" };
  }

  const matches = await authRepository.findCredentials(identifier);
  // An email shared by accounts in two clinics is ambiguous: refuse rather than guess.
  const user = matches.length === 1 ? matches[0] : null;
  // Always run the hash check (dummy hash for unknown users) for constant timing.
  const passwordValid = await verifyPassword(user?.passwordHash, password);
  const role = user?.userRoles[0]?.role.code;
  const usable = !!user && user.status === "active" && !!role && isRole(role);

  if (!user || !passwordValid || !usable) {
    const reason = !user ? "unknown_account" : !passwordValid ? "bad_password" : `account_${user.status}`;
    logSecurityEvent("login_failed", { ipAddress, userId: user?.id, reason });
    if (user) {
      await audit({ action: AUDIT_ACTIONS.LOGIN_FAILED, resourceType: "user", resourceId: user.id, actorId: user.id, clinicId: user.clinicId, metadata: { reason } });
      if (!passwordValid && user.status === "active") await lockOnRepeatedFailures(user);
    }
    return { ok: false, reason: "invalid_credentials" };
  }

  await rateLimiter.reset(identifierKey);
  await audit({ action: AUDIT_ACTIONS.LOGIN_SUCCEEDED, resourceType: "user", resourceId: user.id, actorId: user.id, clinicId: user.clinicId });

  return { ok: true, user: { id: user.id, email: user.email, name: user.fullName, role: role as AuthUser["role"] } };
}

async function lockOnRepeatedFailures(user: { id: string; clinicId: string; clinic: { settings: unknown } }) {
  if (!signInRulesFrom(user.clinic.settings).lockAfterFailedLogins) return;
  const failures = await authRepository.countRecentFailedLogins(user.id, AUDIT_ACTIONS.LOGIN_FAILED, LOCK_RESET_ACTIONS);
  if (failures < SECURITY.accountLock.maxFailedLogins) return;
  await prisma.$transaction(async (tx) => {
    await authRepository.setStatus(user.id, "suspended", tx);
    await authRepository.revokeUserSessions(user.id, tx);
    await audit({ action: AUDIT_ACTIONS.USER_LOCKED, resourceType: "user", resourceId: user.id, clinicId: user.clinicId }, tx);
  });
  logSecurityEvent("account_locked", { userId: user.id });
}

/** Records a new sign-in in `security_sessions`; the raw secret goes into the session cookie only. */
export async function startSession(userId: string, remember: boolean): Promise<StartedSession> {
  const { token, tokenHash } = generateToken();
  const expiresAt = new Date(Date.now() + sessionLifetimeSeconds(remember) * 1000);
  const { id } = await authRepository.createSession(userId, tokenHash, expiresAt);
  return { sessionId: id, sessionSecret: token };
}

/** Changes the password and ends every session (including the current one). */
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
    await audit({ action: AUDIT_ACTIONS.PASSWORD_CHANGED, resourceType: "user", resourceId: user.id, actorId: user.id, clinicId: user.clinicId }, tx);
  });
}

export async function updateProfile(user: AuthUser, input: UpdateProfileInput): Promise<ProfileDto> {
  const data = updateProfileSchema.parse(input);
  const updated = await authRepository.updateProfile(user.id, { fullName: data.name });
  await audit({
    action: AUDIT_ACTIONS.PROFILE_UPDATED,
    resourceType: "user",
    resourceId: user.id,
    actorId: user.id,
    clinicId: user.clinicId,
    metadata: { changedFields: ["name"] },
  });
  return { name: updated.fullName };
}

/** Ends the current session only. */
export async function recordLogout(user: AuthUser): Promise<void> {
  await authRepository.revokeSession(user.sessionId);
  await audit({ action: AUDIT_ACTIONS.LOGOUT, resourceType: "user", resourceId: user.id, actorId: user.id, clinicId: user.clinicId });
}

/** "Sign out everywhere": every open session of the user ends. */
export async function revokeAllSessions(user: AuthUser): Promise<void> {
  await revokeAllSessionsFor(user, user.id);
}

/** Ends every session of `user`; `actorId` is who asked (the user, or an owner/manager). */
export async function revokeAllSessionsFor(user: { id: string; clinicId: string }, actorId: string): Promise<void> {
  await authRepository.revokeUserSessions(user.id);
  await audit({ action: AUDIT_ACTIONS.SESSIONS_REVOKED, resourceType: "user", resourceId: user.id, actorId, clinicId: user.clinicId });
}
