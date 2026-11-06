/**
 * Requires DATABASE_URL_TEST (a disposable MySQL database). Skipped otherwise.
 *   DATABASE_URL_TEST="mysql://user:pass@localhost:3306/ismile_test" npm run test:integration
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, connectTestDatabase } from "../helpers/db";

const enabled = connectTestDatabase();
const mail = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("@backend/lib/email/mailer", () => ({ sendEmail: mail.sendEmail }));

describe.skipIf(!enabled)("authentication against MySQL", async () => {
  const { prisma } = await import("@backend/lib/prisma");
  const { hashPassword, verifyPassword } = await import("@backend/lib/security/password");
  const { verifyCredentials } = await import("@backend/features/auth/auth.service");
  const reset = await import("@backend/features/auth/password-reset.service");
  const { authRepository } = await import("@backend/features/auth/auth.repository");
  const { hashToken, generateToken } = await import("@backend/lib/security/password");

  const PASSWORD = "integration pass phrase";
  let userId: string;
  let ip = 0;
  const nextIp = () => `192.168.1.${++ip}`;

  beforeAll(async () => {
    await resetDatabase(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await prisma.rateLimit.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.clinic.deleteMany();
    const clinic = await prisma.clinic.create({ data: { name: "Test Clinic" } });
    const user = await prisma.user.create({
      data: { email: "dana@ismile.test", name: "Dana", role: "DENTIST", clinicId: clinic.id, passwordHash: await hashPassword(PASSWORD) },
    });
    userId = user.id;
  });

  it("logs in with valid credentials and records the login", async () => {
    const result = await verifyCredentials({ email: "DANA@ismile.test", password: PASSWORD }, nextIp());
    expect(result).toMatchObject({ ok: true, user: { id: userId, sessionVersion: 0 } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.lastLoginAt).toBeInstanceOf(Date);
    expect(await prisma.auditLog.count({ where: { action: "auth.login.succeeded", actorId: userId } })).toBe(1);
  });

  it("rejects invalid and disabled logins", async () => {
    expect((await verifyCredentials({ email: "dana@ismile.test", password: "wrong wrong" }, nextIp())).ok).toBe(false);
    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    expect((await verifyCredentials({ email: "dana@ismile.test", password: PASSWORD }, nextIp())).ok).toBe(false);
  });

  it("throttles with the MySQL-backed limiter", async () => {
    for (let i = 0; i < 5; i++) await verifyCredentials({ email: "dana@ismile.test", password: "wrong wrong" }, nextIp());
    await expect(verifyCredentials({ email: "dana@ismile.test", password: PASSWORD }, nextIp())).resolves.toEqual({
      ok: false,
      reason: "rate_limited",
    });
    const bucket = await prisma.rateLimit.findUnique({ where: { id: "login-email:dana@ismile.test" } });
    expect(bucket?.count).toBe(6);
  });

  it("completes a password reset once, revoking sessions", async () => {
    await reset.requestPasswordReset({ email: "dana@ismile.test" }, nextIp());
    const link = (mail.sendEmail.mock.calls[0][0].text as string).match(/https?:\/\/\S+/)![0];
    const token = new URL(link).searchParams.get("token")!;

    const stored = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId } });
    expect(stored.tokenHash).toBe(hashToken(token));
    expect(stored.tokenHash).not.toBe(token);
    await expect(reset.isResetTokenValid(token)).resolves.toBe(true);

    const newPassword = "brand new phrase 77";
    await reset.resetPassword({ token, password: newPassword, confirmPassword: newPassword });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.sessionVersion).toBe(1); // all previously issued sessions revoked
    await expect(verifyPassword(user.passwordHash, newPassword)).resolves.toBe(true);

    await expect(reset.isResetTokenValid(token)).resolves.toBe(false);
    await expect(reset.resetPassword({ token, password: newPassword, confirmPassword: newPassword })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects expired reset tokens", async () => {
    const { token, tokenHash } = generateToken();
    await authRepository.createPasswordToken(userId, tokenHash, "RESET", new Date(Date.now() - 1000));
    await expect(reset.isResetTokenValid(token)).resolves.toBe(false);
    await expect(
      reset.resetPassword({ token, password: "brand new phrase 77", confirmPassword: "brand new phrase 77" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("issuing a new token invalidates the previous one", async () => {
    const first = generateToken();
    const second = generateToken();
    await authRepository.createPasswordToken(userId, first.tokenHash, "RESET", new Date(Date.now() + 60_000));
    await authRepository.createPasswordToken(userId, second.tokenHash, "RESET", new Date(Date.now() + 60_000));
    await expect(reset.isResetTokenValid(first.token)).resolves.toBe(false);
    await expect(reset.isResetTokenValid(second.token)).resolves.toBe(true);
  });
});
