import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeUser } from "../helpers/fixtures";

const mocks = vi.hoisted(() => ({
  repo: {
    findCredentials: vi.fn(),
    countRecentFailedLogins: vi.fn().mockResolvedValue(0),
    setStatus: vi.fn(),
    revokeUserSessions: vi.fn(),
    createSession: vi.fn(),
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

// Clears call history only; each mock keeps its implementation.
beforeEach(() => vi.clearAllMocks());

const USER_ID = "00000000-0000-4000-8000-300000000001";
const CLINIC_ID = "00000000-0000-4000-8000-00000000000a";

const account = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  email: "dana@ismile.test",
  fullName: "Dana",
  status: "active",
  passwordHash,
  clinicId: CLINIC_ID,
  clinic: { settings: { signIn: { lockAfterFailedLogins: true, idleSignOut: false } } },
  userRoles: [{ role: { code: "DENTIST" } }],
  ...overrides,
});

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
  it("normalises an email or staff ID at login", () => {
    expect(loginSchema.parse({ email: "  Dana@ISMILE.test ", password: "x" }).email).toBe("dana@ismile.test");
    expect(loginSchema.parse({ email: " fd-003 ", password: "x" }).email).toBe("FD-003");
    expect(loginSchema.safeParse({ email: "not an id!", password: "x" }).success).toBe(false);
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
      user: { id: "u1", role: "DENTIST", remember: true },
    } as never) as Record<string, unknown>;
    expect(token.rm).toBe(true);
    expect(token.lat).toBeTypeOf("number");
  });

  it("carries the security_sessions id and secret into the token and session", () => {
    const token = authConfig.callbacks.jwt({
      token: {},
      user: { id: "u1", role: "DENTIST", sessionId: "s1", sessionSecret: "secret" },
    } as never) as Record<string, unknown>;
    expect(token).toMatchObject({ uid: "u1", role: "DENTIST", sid: "s1", sst: "secret" });
    const session = authConfig.callbacks.session({
      session: { user: { email: "x" }, expires: "" },
      token,
    } as never) as unknown as { user: { id: string }; sessionId: string; sessionSecret: string };
    expect(session.user.id).toBe("u1");
    expect(session).toMatchObject({ sessionId: "s1", sessionSecret: "secret" });
  });
});

describe("verifyCredentials (login)", () => {
  const login = (email: string, password = PASSWORD) => verifyCredentials({ email, password }, freshIp());

  it("accepts valid credentials and returns no password hash", async () => {
    mocks.repo.findCredentials.mockResolvedValue([account()]);
    await expect(login("Dana@ismile.test")).resolves.toEqual({
      ok: true,
      user: { id: USER_ID, email: "dana@ismile.test", name: "Dana", role: "DENTIST" },
    });
    expect(mocks.repo.findCredentials).toHaveBeenCalledWith("dana@ismile.test");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.login.succeeded", clinicId: CLINIC_ID }));
  });

  it("signs in with a staff ID", async () => {
    mocks.repo.findCredentials.mockResolvedValue([account()]);
    expect((await login("fd-003")).ok).toBe(true);
    expect(mocks.repo.findCredentials).toHaveBeenCalledWith("FD-003");
  });

  it("refuses an email that matches accounts in two clinics", async () => {
    mocks.repo.findCredentials.mockResolvedValue([account(), account({ id: "other" })]);
    expect((await login("dup@ismile.test")).ok).toBe(false);
  });

  it("rejects a wrong password with a generic reason", async () => {
    mocks.repo.findCredentials.mockResolvedValue([account()]);
    await expect(login("dana@ismile.test", "nope nope nope")).resolves.toEqual({ ok: false, reason: "invalid_credentials" });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.login.failed" }));
  });

  it("gives the same answer for unknown accounts (no enumeration)", async () => {
    mocks.repo.findCredentials.mockResolvedValue([]);
    await expect(login("ghost@ismile.test")).resolves.toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("locks the account at the clinic's limit of wrong passwords", async () => {
    mocks.repo.findCredentials.mockResolvedValue([account()]);
    mocks.repo.countRecentFailedLogins.mockResolvedValueOnce(4);
    await login("lock1@ismile.test", "wrong wrong wrong");
    expect(mocks.repo.setStatus).not.toHaveBeenCalled();

    mocks.repo.countRecentFailedLogins.mockResolvedValueOnce(5);
    await login("lock2@ismile.test", "wrong wrong wrong");
    expect(mocks.repo.setStatus).toHaveBeenCalledWith(USER_ID, "suspended", expect.anything());
    expect(mocks.repo.revokeUserSessions).toHaveBeenCalledWith(USER_ID, expect.anything());
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "user.locked" }), expect.anything());
  });

  it("does not lock when the clinic rule is off", async () => {
    mocks.repo.findCredentials.mockResolvedValue([account({ clinic: { settings: { signIn: { lockAfterFailedLogins: false } } } })]);
    await login("nolock@ismile.test", "wrong wrong wrong");
    expect(mocks.repo.countRecentFailedLogins).not.toHaveBeenCalled();
    expect(mocks.repo.setStatus).not.toHaveBeenCalled();
  });

  it("refuses suspended, disabled and invited accounts even with the right password", async () => {
    for (const status of ["suspended", "disabled", "invited"]) {
      mocks.repo.findCredentials.mockResolvedValue([account({ status })]);
      expect((await login(status + "@ismile.test")).ok).toBe(false);
    }
    mocks.repo.findCredentials.mockResolvedValue([account({ passwordHash: null })]);
    expect((await login("nopw@ismile.test")).ok).toBe(false);
  });

  it("throttles repeated attempts against one email", async () => {
    mocks.repo.findCredentials.mockResolvedValue([account()]);
    const email = "throttle@ismile.test";
    for (let i = 0; i < 5; i++) expect((await login(email, "wrong wrong wrong")).ok).toBe(false);
    // Even the correct password is refused once the bucket is exhausted.
    await expect(login(email)).resolves.toEqual({ ok: false, reason: "rate_limited" });
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
    const user = makeUser("FRONT_DESK");
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
    mocks.repo.findValidToken.mockResolvedValue({ id: "t1", userId: "u1", purpose: "reset", user: { status: "active", clinicId: CLINIC_ID } });
    mocks.repo.consumeToken.mockResolvedValue(false); // another request consumed it first
    await expect(resetPassword(input)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.repo.setPassword).not.toHaveBeenCalled();
  });

  it("sets the password, revokes sessions and invalidates other tokens", async () => {
    mocks.repo.findValidToken.mockResolvedValue({ id: "t1", userId: "u1", purpose: "reset", user: { status: "active", clinicId: CLINIC_ID } });
    mocks.repo.consumeToken.mockResolvedValue(true);
    await resetPassword(input);
    expect(mocks.repo.setPassword).toHaveBeenCalledWith("u1", expect.stringMatching(/^\$argon2id\$/), expect.anything());
    expect(mocks.repo.invalidateUserTokens).toHaveBeenCalledWith("u1", expect.anything());
  });

  it("does not reveal whether an account exists when requesting a reset", async () => {
    mocks.repo.findActiveUserByEmail.mockResolvedValue(null);
    await expect(requestPasswordReset({ email: "ghost@ismile.test" }, freshIp())).resolves.toBeUndefined();
    expect(mocks.sendEmail).not.toHaveBeenCalled();

    mocks.repo.findActiveUserByEmail.mockResolvedValue({ id: "u1", email: "dana@ismile.test", fullName: "Dana", clinicId: CLINIC_ID });
    await expect(requestPasswordReset({ email: "dana@ismile.test" }, freshIp())).resolves.toBeUndefined();
    expect(mocks.repo.createPasswordToken).toHaveBeenCalledWith("u1", expect.stringMatching(/^[a-f0-9]{64}$/), "reset", expect.any(Date));
    const sentText: string = mocks.sendEmail.mock.calls[0][0].text;
    const storedHash = mocks.repo.createPasswordToken.mock.calls[0][1];
    const sentToken = new URL(sentText.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
    expect(hashToken(sentToken)).toBe(storedHash); // DB holds only the hash
  });

  it("issues reset tokens that expire in 30 minutes", async () => {
    mocks.repo.findActiveUserByEmail.mockResolvedValue({ id: "u2", email: "x@ismile.test", fullName: "X", clinicId: CLINIC_ID });
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
