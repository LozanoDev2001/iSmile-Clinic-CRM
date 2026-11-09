import "server-only";
import type { PasswordTokenPurpose, UserStatus } from "@backend/config/statuses";
import { prisma, type TransactionClient } from "@backend/lib/prisma";

/**
 * Database access for authentication. Selects are explicit so password
 * hashes are only loaded where they are verified, never by accident.
 */

const grantSelect = { permission: { select: { resource: true, action: true } } } as const;

/** Everything needed to rebuild the signed-in user on each request. */
const sessionUserSelect = {
  id: true,
  email: true,
  fullName: true,
  status: true,
  clinicId: true,
  clinic: { select: { settings: true } },
  userRoles: { select: { role: { select: { code: true, rolePermissions: { select: grantSelect } } } } },
  userPermissionOverrides: { select: { decision: true, ...grantSelect } },
} as const;

export const authRepository = {
  /** For credential verification only. Matches an email or a staff code; callers reject ambiguous results. */
  findCredentials(identifier: string) {
    return prisma.user.findMany({
      where: { OR: [{ email: identifier }, { staffCode: identifier }] },
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        passwordHash: true,
        clinicId: true,
        clinic: { select: { settings: true } },
        userRoles: { select: { role: { select: { code: true } } } },
      },
      take: 2,
    });
  },

  /** Authoritative per-request lookup used by requireAuth(). */
  findSession(id: string) {
    return prisma.securitySession.findUnique({
      where: { id },
      select: { refreshTokenHash: true, expiresAt: true, revokedAt: true, user: { select: sessionUserSelect } },
    });
  },

  createSession(userId: string, refreshTokenHash: string, expiresAt: Date) {
    return prisma.securitySession.create({ data: { userId, refreshTokenHash, expiresAt }, select: { id: true } });
  },

  revokeSession(id: string) {
    return prisma.securitySession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  },

  /** Ends every open session of the user (sign out everywhere, password change, deactivation). */
  revokeUserSessions(userId: string, tx: TransactionClient = prisma) {
    return tx.securitySession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  },

  findPasswordHash(id: string) {
    return prisma.user.findUnique({ where: { id }, select: { passwordHash: true } });
  },

  findActiveUserByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email, status: "active" satisfies UserStatus },
      select: { id: true, email: true, fullName: true, clinicId: true },
    });
  },

  setStatus(id: string, status: UserStatus, tx: TransactionClient = prisma) {
    return tx.user.update({ where: { id }, data: { status }, select: { id: true } });
  },

  /** Sets a new password, activates an invited account and ends every existing session. */
  async setPassword(id: string, passwordHash: string, tx: TransactionClient) {
    const user = await tx.user.update({ where: { id }, data: { passwordHash }, select: { id: true, status: true, clinicId: true } });
    if (user.status === "invited") await tx.user.update({ where: { id }, data: { status: "active" satisfies UserStatus } });
    await this.revokeUserSessions(id, tx);
    return user;
  },

  updateProfile(id: string, data: { fullName: string }) {
    return prisma.user.update({ where: { id }, data, select: { id: true, fullName: true, clinicId: true } });
  },

  /** Wrong passwords since the last successful sign-in, unlock or password reset. */
  async countRecentFailedLogins(userId: string, failedAction: string, resetActions: string[]) {
    const lastReset = await prisma.auditLog.findFirst({
      where: { entityType: "user", entityId: userId, action: { in: resetActions } },
      select: { occurredAt: true },
      orderBy: { occurredAt: "desc" },
    });
    return prisma.auditLog.count({
      where: { entityType: "user", entityId: userId, action: failedAction, ...(lastReset ? { occurredAt: { gt: lastReset.occurredAt } } : {}) },
    });
  },

  // ─── Password reset / invite tokens ────────────────────────────────────────

  /** Replaces any outstanding tokens of the same purpose with a new one. */
  async createPasswordToken(
    userId: string,
    tokenHash: string,
    purpose: PasswordTokenPurpose,
    expiresAt: Date,
    tx: TransactionClient = prisma,
  ) {
    await tx.passwordToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
    return tx.passwordToken.create({ data: { userId, tokenHash, purpose, expiresAt }, select: { id: true } });
  },

  findValidToken(tokenHash: string, now = new Date()) {
    return prisma.passwordToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      select: { id: true, userId: true, purpose: true, user: { select: { status: true, clinicId: true } } },
    });
  },

  /**
   * Marks a token used only if it is still unused. Returns false if another
   * request consumed it first — this is what makes tokens single-use under
   * concurrency.
   */
  async consumeToken(id: string, tx: TransactionClient): Promise<boolean> {
    const { count } = await tx.passwordToken.updateMany({
      where: { id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    return count === 1;
  },

  invalidateUserTokens(userId: string, tx: TransactionClient) {
    return tx.passwordToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
  },
};
