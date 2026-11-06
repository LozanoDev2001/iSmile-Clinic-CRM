import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeUser } from "../helpers/fixtures";

const mocks = vi.hoisted(() => ({
  repo: {
    findCredentialsByEmail: vi.fn(),
    recordLogin: vi.fn(),
    findPasswordHash: vi.fn(),
    setPassword: vi.fn(),
    invalidateUserTokens: vi.fn(),
    findValidToken: vi.fn(),
    consumeToken: vi.fn(),
    findActiveUserByEmail: vi.fn(),
    createPasswordToken: vi.fn(),
  },
  audit: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@backend/features/auth/auth.repository", () => ({ authRepository: mocks.repo }));
vi.mock("@backend/lib/logging/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@backend/lib/logging/audit")>()),
  audit: mocks.audit,
}));
vi.mock("@backend/lib/email/mailer", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@backend/lib/prisma", () => ({
  prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({}) },
}));
// Swap the MySQL-backed limiter for an in-memory one.
vi.mock("@backend/lib/security/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@backend/lib/security/rate-limit")>();
  return { ...actual, rateLimiter: actual.createRateLimiter(actual.createMemoryStore()) };
});

const { hashPassword, verifyPassword, generateToken, hashToken } = await import("@backend/lib/security/password");
const { verifyCredentials, changePassword } = await import("@backend/features/auth/auth.service");
const { resetPassword, requestPasswordReset } = await import("@backend/features/auth/password-reset.service");
const { loginSchema } = await import("@backend/features/auth/login.schema");
const { changePasswordSchema, newPasswordSchema } = await import("@backend/features/auth/password.schema");
const { resetTokenSchema } = await import("@backend/features/auth/reset-password.schema");
const { safeCallbackUrl } = await import("@backend/config/security");
const { authConfig } = await import("@backend/lib/auth.config");

const PASSWORD = "correct horse battery";
const passwordHash = await hashPassword(PASSWORD);
let ipCounter = 0;
const freshIp = () => `10.0.0.${++ipCounter}`;

const account = (overrides: Record<string, unknown> = {}) => ({
  id: "cuser00000000000000000001",
  email: "dana@ismile.test",
  name: "Dana",
  role: "DENTIST",
  isActive: true,
  passwordHash,
  sessionVersion: 4,
  clinic: { isActive: true },
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

describe("password hashing", () => {
  it("uses Argon2id and verifies correctly", async () => {
    expect(passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(passwordHash).not.toContain(PASSWORD);
    await expect(verifyPassword(passwordHash, PASSWORD)).resolves.toBe(true);
    await expect(verifyPassword(passwordHash, "wrong password!!")).resolves.toBe(false);
  });

  it("returns false (after a dummy hash) for missing or malformed hashes", async () => {
    await expect(verifyPassword(null, PASSWORD)).resolves.toBe(false);
    await expect(verifyPassword("not-a-hash", PASSWORD)).resolves.toBe(false);
  });
});

describe("tokens", () => {
  it("generates 256-bit URL-safe tokens and stores only their SHA-256", () => {
    const { token, tokenHash } = generateToken();
    expect(resetTokenSchema.safeParse(token).success).toBe(true);
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(token)).toBe(tokenHash);
    expect(generateToken().token).not.toBe(token);
  });
});

describe("validation schemas", () => {
  it("normalises login email", () => {
    expect(loginSchema.parse({ email: "  Dana@ISMILE.test ", password: "x" }).email).toBe("dana@ismile.test");
    expect(loginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
  });

  it("enforces the password policy", () => {
    expect(newPasswordSchema.safeParse("short").success).toBe(false);
    expect(newPasswordSchema.safeParse("aaaaaaaaaaaaaaaa").success).toBe(false);
    expect(newPasswordSchema.safeParse(" leading space pw").success).toBe(false);
    expect(newPasswordSchema.safeParse("Password1234").success).toBe(false);
    expect(newPasswordSchema.safeParse("blue-tooth brush 42").success).toBe(true);
  });

  it("requires matching confirmation and a different new password", () => {
    const r1 = changePasswordSchema.safeParse({ currentPassword: "a", newPassword: "blue-tooth brush 42", confirmPassword: "other" });
    expect(r1.success).toBe(false);
    const r2 = changePasswordSchema.safeParse({ currentPassword: "blue-tooth brush 42", newPassword: "blue-tooth brush 42", confirmPassword: "blue-tooth brush 42" });
    expect(r2.success).toBe(false);
  });

  it("only allows same-site relative callback URLs", () => {
    expect(safeCallbackUrl("/users?page=2")).toBe("/users?page=2");
    expect(safeCallbackUrl("https://evil.example")).toBe("/dashboard");
    expect(safeCallbackUrl("//evil.example")).toBe("/dashboard");
    expect(safeCallbackUrl("/\\evil.example")).toBe("/dashboard");
    expect(safeCallbackUrl("/login")).toBe("/dashboard");
    expect(safeCallbackUrl(undefined)).toBe("/dashboard");
  });
});

describe("session configuration", () => {
  it("uses JWT sessions with an absolute expiry and rolling renewal", () => {
    expect(authConfig.session.strategy).toBe("jwt");
    // Cookie lives as long as the longest ("Keep me signed in") session.
    expect(authConfig.session.maxAge).toBe(72 * 3600);
    expect(authConfig.session.updateAge).toBeLessThan(authConfig.session.maxAge);
  });

  it("ends sessions at an absolute limit: 8h normally, 72h with 'Keep me signed in'", () => {
    const now = Math.floor(Date.now() / 1000);
    const jwt = (token: Record<string, unknown>) =>
      authConfig.callbacks.jwt({ token } as never) as Record<string, unknown> | null;

    expect(jwt({ uid: "u1", rm: false, lat: now - 7 * 3600 })).not.toBeNull();
    expect(jwt({ uid: "u1", rm: false, lat: now - 9 * 3600 })).toBeNull();
    expect(jwt({ uid: "u1", rm: true, lat: now - 9 * 3600 })).not.toBeNull();
    expect(jwt({ uid: "u1", rm: true, lat: now - 73 * 3600 })).toBeNull();
  });

  it("records the remember choice and login time at sign-in", () => {
    const token = authConfig.callbacks.jwt({
      token: {},
      user: { id: "u1", role: "DENTIST", sessionVersion: 0, remember: true },
    } as never) as Record<string, unknown>;
    expect(token.rm).toBe(true);
    expect(token.lat).toBeTypeOf("number");
  });

  it("carries the session version into the token and session", () => {
    const token = authConfig.callbacks.jwt({
      token: {},
      user: { id: "u1", role: "DENTIST", sessionVersion: 7 },
    } as never) as Record<string, unknown>;
    expect(token).toMatchObject({ uid: "u1", role: "DENTIST", sv: 7 });
    const session = authConfig.callbacks.session({
      session: { user: { email: "x" }, expires: "" },
      token,
    } as never) as unknown as { user: { id: string }; sessionVersion: number };
    expect(session.user.id).toBe("u1");
    expect(session.sessionVersion).toBe(7);
  });
});

describe("verifyCredentials (login)", () => {
  it("accepts valid credentials and returns no password hash", async () => {
    mocks.repo.findCredentialsByEmail.mockResolvedValue(account());
    const result = await verifyCredentials({ email: "Dana@ismile.test", password: PASSWORD }, freshIp());
    expect(result).toEqual({
      ok: true,
      user: { id: "cuser00000000000000000001", email: "dana@ismile.test", name: "Dana", role: "DENTIST", sessionVersion: 4 },
    });
    expect(mocks.repo.findCredentialsByEmail).toHaveBeenCalledWith("dana@ismile.test");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.login.succeeded" }));
  });

  it("rejects a wrong password with a generic reason", async () => {
    mocks.repo.findCredentialsByEmail.mockResolvedValue(account());
    await expect(verifyCredentials({ email: "dana@ismile.test", password: "nope nope nope" }, freshIp())).resolves.toEqual({
      ok: false,
      reason: "invalid_credentials",
    });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.login.failed" }));
  });

  it("gives the same answer for unknown accounts (no enumeration)", async () => {
    mocks.repo.findCredentialsByEmail.mockResolvedValue(null);
    await expect(verifyCredentials({ email: "ghost@ismile.test", password: PASSWORD }, freshIp())).resolves.toEqual({
      ok: false,
      reason: "invalid_credentials",
    });
  });

  it("rejects disabled accounts and disabled clinics even with the right password", async () => {
    mocks.repo.findCredentialsByEmail.mockResolvedValue(account({ isActive: false }));
    expect((await verifyCredentials({ email: "dana@ismile.test", password: PASSWORD }, freshIp())).ok).toBe(false);
    mocks.repo.findCredentialsByEmail.mockResolvedValue(account({ clinic: { isActive: false } }));
    expect((await verifyCredentials({ email: "dana@ismile.test", password: PASSWORD }, freshIp())).ok).toBe(false);
    mocks.repo.findCredentialsByEmail.mockResolvedValue(account({ passwordHash: null })); // invite pending
    expect((await verifyCredentials({ email: "dana@ismile.test", password: PASSWORD }, freshIp())).ok).toBe(false);
  });

  it("throttles repeated attempts against one email", async () => {
    mocks.repo.findCredentialsByEmail.mockResolvedValue(account());
    const email = "throttle@ismile.test";
    for (let i = 0; i < 5; i++) {
      expect((await verifyCredentials({ email, password: "wrong wrong wrong" }, freshIp())).ok).toBe(false);
    }
    // Even the correct password is refused once the bucket is exhausted.
    await expect(verifyCredentials({ email, password: PASSWORD }, freshIp())).resolves.toEqual({ ok: false, reason: "rate_limited" });
  });
});

describe("changePassword", () => {
  it("requires the current password", async () => {
    mocks.repo.findPasswordHash.mockResolvedValue({ passwordHash });
    await expect(
      changePassword(makeUser("DENTIST"), { currentPassword: "wrong one", newPassword: "blue-tooth brush 42", confirmPassword: "blue-tooth brush 42" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", fields: { currentPassword: ["Current password is incorrect"] } });
    expect(mocks.repo.setPassword).not.toHaveBeenCalled();
  });

  it("re-hashes, revokes sessions and outstanding reset tokens", async () => {
    mocks.repo.findPasswordHash.mockResolvedValue({ passwordHash });
    const user = makeUser("RECEPTIONIST");
    await changePassword(user, { currentPassword: PASSWORD, newPassword: "blue-tooth brush 42", confirmPassword: "blue-tooth brush 42" });
    const [id, newHash] = mocks.repo.setPassword.mock.calls[0];
    expect(id).toBe(user.id);
    await expect(verifyPassword(newHash, "blue-tooth brush 42")).resolves.toBe(true);
    expect(mocks.repo.invalidateUserTokens).toHaveBeenCalledWith(user.id, expect.anything());
  });
});

describe("password reset", () => {
  const { token } = generateToken();
  const input = { token, password: "new secure phrase 9", confirmPassword: "new secure phrase 9" };

  it("rejects unknown, expired or used tokens", async () => {
    mocks.repo.findValidToken.mockResolvedValue(null); // query filters expiresAt > now AND usedAt IS NULL
    await expect(resetPassword(input)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.repo.findValidToken).toHaveBeenCalledWith(hashToken(token));
  });

  it("is single-use even under concurrent submissions", async () => {
    mocks.repo.findValidToken.mockResolvedValue({ id: "t1", userId: "u1", purpose: "RESET", user: { isActive: true, clinicId: null } });
    mocks.repo.consumeToken.mockResolvedValue(false); // another request consumed it first
    await expect(resetPassword(input)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.repo.setPassword).not.toHaveBeenCalled();
  });

  it("sets the password, revokes sessions and invalidates other tokens", async () => {
    mocks.repo.findValidToken.mockResolvedValue({ id: "t1", userId: "u1", purpose: "RESET", user: { isActive: true, clinicId: null } });
    mocks.repo.consumeToken.mockResolvedValue(true);
    await resetPassword(input);
    expect(mocks.repo.setPassword).toHaveBeenCalledWith("u1", expect.stringMatching(/^\$argon2id\$/), expect.anything());
    expect(mocks.repo.invalidateUserTokens).toHaveBeenCalledWith("u1", expect.anything());
  });

  it("does not reveal whether an account exists when requesting a reset", async () => {
    mocks.repo.findActiveUserByEmail.mockResolvedValue(null);
    await expect(requestPasswordReset({ email: "ghost@ismile.test" }, freshIp())).resolves.toBeUndefined();
    expect(mocks.sendEmail).not.toHaveBeenCalled();

    mocks.repo.findActiveUserByEmail.mockResolvedValue({ id: "u1", email: "dana@ismile.test", name: "Dana", clinicId: null });
    await expect(requestPasswordReset({ email: "dana@ismile.test" }, freshIp())).resolves.toBeUndefined();
    expect(mocks.repo.createPasswordToken).toHaveBeenCalledWith("u1", expect.stringMatching(/^[a-f0-9]{64}$/), "RESET", expect.any(Date));
    const sentText: string = mocks.sendEmail.mock.calls[0][0].text;
    const storedHash = mocks.repo.createPasswordToken.mock.calls[0][1];
    const sentToken = new URL(sentText.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
    expect(hashToken(sentToken)).toBe(storedHash); // DB holds only the hash
  });

  it("issues reset tokens that expire in 30 minutes", async () => {
    mocks.repo.findActiveUserByEmail.mockResolvedValue({ id: "u2", email: "x@ismile.test", name: "X", clinicId: null });
    const before = Date.now();
    await requestPasswordReset({ email: "x@ismile.test" }, freshIp());
    const expiresAt: Date = mocks.repo.createPasswordToken.mock.calls[0][3];
    expect(expiresAt.getTime() - before).toBeGreaterThan(29 * 60_000);
    expect(expiresAt.getTime() - before).toBeLessThanOrEqual(30 * 60_000 + 1000);
  });

  it("throttles reset requests per IP", async () => {
    mocks.repo.findActiveUserByEmail.mockResolvedValue(null);
    const ip = freshIp();
    for (let i = 0; i < 5; i++) await requestPasswordReset({ email: `a${i}@ismile.test` }, ip);
    await expect(requestPasswordReset({ email: "z@ismile.test" }, ip)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
