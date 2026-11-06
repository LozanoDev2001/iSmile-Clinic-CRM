import "server-only";
import { prisma, type TransactionClient } from "@backend/lib/prisma";
import type { PasswordTokenPurpose } from "@backend/generated/prisma/enums";

/**
 * Database access for authentication. Selects are explicit so password
 * hashes are only loaded where they are verified, never by accident.
 */

const sessionUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  clinicId: true,
  isActive: true,
  sessionVersion: true,
  clinic: { select: { isActive: true } },
  branches: { select: { branchId: true } },
} as const;

export const authRepository = {
  /** For credential verification only. */
  findCredentialsByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        passwordHash: true,
        sessionVersion: true,
        clinic: { select: { isActive: true } },
      },
    });
  },

  /** Authoritative per-request lookup used by requireAuth(). */
  findSessionUser(id: string) {
    return prisma.user.findUnique({ where: { id }, select: sessionUserSelect });
  },

  findPasswordHash(id: string) {
    return prisma.user.findUnique({ where: { id }, select: { passwordHash: true } });
  },

  findActiveUserByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email, isActive: true },
      select: { id: true, email: true, name: true, clinicId: true },
    });
  },

  recordLogin(id: string) {
    return prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() }, select: { id: true } });
  },

  /** Sets a new password and revokes every existing session. */
  setPassword(id: string, passwordHash: string, tx: TransactionClient = prisma) {
    return tx.user.update({
      where: { id },
      data: { passwordHash, passwordChangedAt: new Date(), sessionVersion: { increment: 1 } },
      select: { id: true, clinicId: true },
    });
  },

  revokeSessions(id: string, tx: TransactionClient = prisma) {
    return tx.user.update({
      where: { id },
      data: { sessionVersion: { increment: 1 } },
      select: { id: true, clinicId: true },
    });
  },

  updateProfile(id: string, data: { name: string }) {
    return prisma.user.update({ where: { id }, data, select: { id: true, name: true, clinicId: true } });
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
    await tx.passwordResetToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    });
    return tx.passwordResetToken.create({
      data: { userId, tokenHash, purpose, expiresAt },
      select: { id: true },
    });
  },

  findValidToken(tokenHash: string, now = new Date()) {
    return prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      select: {
        id: true,
        userId: true,
        purpose: true,
        user: { select: { isActive: true, clinicId: true } },
      },
    });
  },

  /**
   * Marks a token used only if it is still unused. Returns false if another
   * request consumed it first — this is what makes tokens single-use under
   * concurrency.
   */
  async consumeToken(id: string, tx: TransactionClient): Promise<boolean> {
    const { count } = await tx.passwordResetToken.updateMany({
      where: { id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    return count === 1;
  },

  invalidateUserTokens(userId: string, tx: TransactionClient) {
    return tx.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  },
};
