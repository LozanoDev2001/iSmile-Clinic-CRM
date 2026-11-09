import { beforeEach, describe, expect, it, vi } from "vitest";
import { grantsFromAccess, roleTemplate } from "@backend/config/access";
import { hashToken } from "@backend/lib/security/password";
import { CLINIC_A, CLINIC_B, makeUser } from "../helpers/fixtures";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findSession: vi.fn(),
}));

vi.mock("@backend/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@backend/features/auth/auth.repository", () => ({
  authRepository: { findSession: mocks.findSession },
}));

const authz = await import("@backend/lib/authorization");

const USER_ID = "00000000-0000-4000-8000-300000000001";
const SESSION_ID = "00000000-0000-4000-8000-400000000001";
const SECRET = "session-secret";

const grantRows = (grants: string[]) =>
  grants.map((g) => ({ permission: { resource: g.slice(0, g.indexOf(":")), action: g.slice(g.indexOf(":") + 1) } }));

const dbSession = (overrides: Record<string, unknown> = {}, userOverrides: Record<string, unknown> = {}) => ({
  refreshTokenHash: hashToken(SECRET),
  expiresAt: new Date(Date.now() + 3_600_000),
  revokedAt: null,
  user: {
    id: USER_ID,
    email: "dana@ismile.test",
    fullName: "Dana",
    status: "active",
    clinicId: CLINIC_A,
    clinic: { settings: { signIn: { lockAfterFailedLogins: true, idleSignOut: true } } },
    userRoles: [{ role: { code: "DENTIST", rolePermissions: grantRows(grantsFromAccess(roleTemplate("DENTIST"))) } }],
    userPermissionOverrides: [],
    passwordHash: "$argon2id$should-never-leak",
    ...userOverrides,
  },
  ...overrides,
});

const session = (secret = SECRET) => ({
  user: { id: USER_ID, role: "DENTIST" },
  sessionId: SESSION_ID,
  sessionSecret: secret,
  expires: new Date(Date.now() + 3_600_000).toISOString(),
});

beforeEach(() => vi.clearAllMocks());

describe("requireAuth (session validation)", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(authz.requireAuth()).rejects.toMatchObject({ code: "UNAUTHENTICATED", statusCode: 401 });
  });

  it("returns a validated user context without sensitive fields", async () => {
    mocks.auth.mockResolvedValue(session());
    mocks.findSession.mockResolvedValue(dbSession());
    const user = await authz.requireAuth();
    expect(mocks.findSession).toHaveBeenCalledWith(SESSION_ID);
    expect(user).toMatchObject({ id: USER_ID, role: "DENTIST", clinicId: CLINIC_A, sessionId: SESSION_ID, idleSignOut: true });
    expect(user.permissions).toContain("patients.medical.read");
    expect(JSON.stringify(user)).not.toContain("argon2");
    expect(JSON.stringify(user)).not.toContain(SECRET);
  });

  it("rejects a revoked session (sign-out, password change, deactivation)", async () => {
    mocks.auth.mockResolvedValue(session());
    mocks.findSession.mockResolvedValue(dbSession({ revokedAt: new Date() }));
    await expect(authz.requireAuth()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects an expired session", async () => {
    mocks.auth.mockResolvedValue(session());
    mocks.findSession.mockResolvedValue(dbSession({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(authz.requireAuth()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects a cookie whose secret does not match the stored hash", async () => {
    mocks.auth.mockResolvedValue(session("forged-secret"));
    mocks.findSession.mockResolvedValue(dbSession());
    await expect(authz.requireAuth()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects suspended, disabled and invited accounts", async () => {
    mocks.auth.mockResolvedValue(session());
    for (const status of ["suspended", "disabled", "invited"]) {
      mocks.findSession.mockResolvedValue(dbSession({}, { status }));
      await expect(authz.requireAuth()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }
  });

  it("rejects a session that no longer exists", async () => {
    mocks.auth.mockResolvedValue(session());
    mocks.findSession.mockResolvedValue(null);
    await expect(authz.requireAuth()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("applies allow/deny overrides on top of the role's grants", async () => {
    mocks.auth.mockResolvedValue(session());
    mocks.findSession.mockResolvedValue(
      dbSession({}, {
        userPermissionOverrides: [
          { decision: "allow", permission: { resource: "billing", action: "view" } },
          { decision: "deny", permission: { resource: "patients", action: "tab:visit_history" } },
        ],
      }),
    );
    const user = await authz.requireAuth();
    expect(user.permissions).toContain("billing.read");
    expect(user.permissions).not.toContain("patients.medical.read");
  });
});

describe("requirePermission / requireRole", () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue(session());
    mocks.findSession.mockResolvedValue(dbSession());
  });

  it("allows a role that has the permission", async () => {
    await expect(authz.requirePermission("patients.medical.read")).resolves.toMatchObject({ role: "DENTIST" });
  });

  it("forbids a role without the permission", async () => {
    await expect(authz.requirePermission("billing.read")).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
  });

  it("requires every listed permission", async () => {
    await expect(authz.requirePermission("patients.read", "users.create")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("checks roles", async () => {
    await expect(authz.requireRole(["DENTIST", "OWNER"])).resolves.toBeTruthy();
    await expect(authz.requireRole("OWNER")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("clinic isolation and record scope", () => {
  it("denies cross-clinic access", () => {
    const owner = makeUser("OWNER");
    expect(() => authz.assertClinicAccess(owner, CLINIC_A)).not.toThrow();
    expect(() => authz.assertClinicAccess(owner, CLINIC_B)).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(() => authz.assertClinicAccess(owner, null)).toThrow();
  });

  it("scopes every user to their clinic, and dentists to their own patients", () => {
    expect(authz.recordScope(makeUser("OWNER"))).toEqual({ clinicId: CLINIC_A, assigneeId: undefined });
    expect(authz.recordScope(makeUser("FRONT_DESK"))).toEqual({ clinicId: CLINIC_A, assigneeId: undefined });
    const dentist = makeUser("DENTIST");
    expect(authz.recordScope(dentist)).toEqual({ clinicId: CLINIC_A, assigneeId: dentist.id });
  });
});
