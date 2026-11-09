/**
 * Requires DATABASE_URL_TEST (a disposable database). Skipped otherwise.
 *   DATABASE_URL_TEST="mysql://user:pass@localhost:3306/ismile_crm_test" npm run test:integration
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@backend/config/permissions";
import { resetDatabase, connectTestDatabase } from "../helpers/db";

const enabled = connectTestDatabase();
const mail = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("@backend/lib/email/mailer", () => ({ sendEmail: mail.sendEmail }));

describe.skipIf(!enabled)("authentication against the database", async () => {
  const { prisma } = await import("@backend/lib/prisma");
  const { hashPassword, verifyPassword } = await import("@backend/lib/security/password");
  const { verifyCredentials, startSession } = await import("@backend/features/auth/auth.service");
  const reset = await import("@backend/features/auth/password-reset.service");
  const { authRepository } = await import("@backend/features/auth/auth.repository");
  const { hashToken, generateToken } = await import("@backend/lib/security/password");

  const PASSWORD = "integration pass phrase";
  let userId: string;
  let roleIds: Map<Role, string>;
  let ip = 0;
  const nextIp = () => `192.168.1.${++ip}`;
  const login = (email: string, password = PASSWORD) => verifyCredentials({ email, password }, nextIp());

  beforeAll(async () => {
    roleIds = await resetDatabase(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await resetDatabase(prisma);
    const clinic = await prisma.clinic.create({ data: { name: "Test Clinic", settings: { signIn: { lockAfterFailedLogins: true, idleSignOut: false } } } });
    const user = await prisma.user.create({
      data: {
        email: "dana@ismile.test",
        fullName: "Dana",
        staffCode: "DN-001",
        status: "active",
        clinicId: clinic.id,
        passwordHash: await hashPassword(PASSWORD),
        userRoles: { create: { roleId: roleIds.get("DENTIST")! } },
      },
    });
    userId = user.id;
  });

  it("logs in by email or staff ID and audits the login", async () => {
    await expect(login("DANA@ismile.test")).resolves.toMatchObject({ ok: true, user: { id: userId, role: "DENTIST" } });
    await expect(login("dn-001")).resolves.toMatchObject({ ok: true, user: { id: userId } });
    expect(await prisma.auditLog.count({ where: { action: "auth.login.succeeded", actorId: userId } })).toBe(2);
  });

  it("records each sign-in as a security_sessions row holding only a hash", async () => {
    const { sessionId, sessionSecret } = await startSession(userId, false);
    const row = await prisma.securitySession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(row.refreshTokenHash).toBe(hashToken(sessionSecret));
    expect(row.refreshTokenHash).not.toBe(sessionSecret);
    expect(row.revokedAt).toBeNull();
  });

  it("rejects invalid and disabled logins", async () => {
    expect((await login("dana@ismile.test", "wrong wrong")).ok).toBe(false);
    await prisma.user.update({ where: { id: userId }, data: { status: "disabled" } });
    expect((await login("dana@ismile.test")).ok).toBe(false);
  });

  it("locks the account after 5 wrong passwords, counted from the audit log", async () => {
    for (let i = 0; i < 5; i++) await verifyCredentials({ email: "dana@ismile.test", password: "wrong wrong" }, nextIp());
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.status).toBe("suspended");
    expect(await prisma.auditLog.count({ where: { action: "user.locked", entityId: userId } })).toBe(1);
  });

  it("throttles with the database-backed limiter", async () => {
    await prisma.clinic.updateMany({ data: { settings: { signIn: { lockAfterFailedLogins: false, idleSignOut: false } } } });
    for (let i = 0; i < 5; i++) await login("dana@ismile.test", "wrong wrong");
    await expect(login("dana@ismile.test")).resolves.toEqual({ ok: false, reason: "rate_limited" });
    const bucket = await prisma.rateLimit.findUnique({ where: { id: "login-email:dana@ismile.test" } });
    expect(bucket?.count).toBe(6);
  });

  it("completes a password reset once, ending every session", async () => {
    const { sessionId } = await startSession(userId, false);
    await reset.requestPasswordReset({ email: "dana@ismile.test" }, nextIp());
    const link = (mail.sendEmail.mock.calls[0][0].text as string).match(/https?:\/\/\S+/)![0];
    const token = new URL(link).searchParams.get("token")!;

    const stored = await prisma.passwordToken.findFirstOrThrow({ where: { userId } });
    expect(stored.tokenHash).toBe(hashToken(token));
    await expect(reset.isResetTokenValid(token)).resolves.toBe(true);

    const newPassword = "brand new phrase 77";
    await reset.resetPassword({ token, password: newPassword, confirmPassword: newPassword });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await expect(verifyPassword(user.passwordHash, newPassword)).resolves.toBe(true);
    expect((await prisma.securitySession.findUniqueOrThrow({ where: { id: sessionId } })).revokedAt).not.toBeNull();

    await expect(reset.isResetTokenValid(token)).resolves.toBe(false);
    await expect(reset.resetPassword({ token, password: newPassword, confirmPassword: newPassword })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects expired reset tokens", async () => {
    const { token, tokenHash } = generateToken();
    await authRepository.createPasswordToken(userId, tokenHash, "reset", new Date(Date.now() - 1000));
    await expect(reset.isResetTokenValid(token)).resolves.toBe(false);
  });

  it("issuing a new token invalidates the previous one", async () => {
    const first = generateToken();
    const second = generateToken();
    await authRepository.createPasswordToken(userId, first.tokenHash, "reset", new Date(Date.now() + 60_000));
    await authRepository.createPasswordToken(userId, second.tokenHash, "reset", new Date(Date.now() + 60_000));
    await expect(reset.isResetTokenValid(first.token)).resolves.toBe(false);
    await expect(reset.isResetTokenValid(second.token)).resolves.toBe(true);
  });
});
