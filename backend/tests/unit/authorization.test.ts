import { beforeEach, describe, expect, it, vi } from "vitest";
import { BRANCH_A1, BRANCH_A2, CLINIC_A, CLINIC_B, makeUser } from "../helpers/fixtures";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findSessionUser: vi.fn(),
  findBranch: vi.fn(),
}));

vi.mock("@backend/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@backend/features/auth/auth.repository", () => ({
  authRepository: { findSessionUser: mocks.findSessionUser },
}));
vi.mock("@backend/lib/prisma", () => ({ prisma: { branch: { findUnique: mocks.findBranch } } }));

const authz = await import("@backend/lib/authorization");

const dbUser = (overrides: Record<string, unknown> = {}) => ({
  id: "cuser00000000000000000001",
  email: "dana@ismile.test",
  name: "Dana",
  role: "DENTIST",
  clinicId: CLINIC_A,
  isActive: true,
  sessionVersion: 3,
  clinic: { isActive: true },
  branches: [{ branchId: BRANCH_A1 }],
  passwordHash: "$argon2id$should-never-leak",
  ...overrides,
});

const session = (sessionVersion = 3) => ({
  user: { id: "cuser00000000000000000001", role: "DENTIST" },
  sessionVersion,
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
    mocks.findSessionUser.mockResolvedValue(dbUser());
    const user = await authz.requireAuth();
    expect(user).toMatchObject({ id: "cuser00000000000000000001", role: "DENTIST", clinicId: CLINIC_A, branchIds: [BRANCH_A1] });
    expect(user.permissions).toContain("patients.medical.read");
    expect(JSON.stringify(user)).not.toContain("argon2");
    expect(user).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("sessionVersion");
  });

  it("rejects a revoked session (password change / sign-out everywhere)", async () => {
    mocks.auth.mockResolvedValue(session(2));
    mocks.findSessionUser.mockResolvedValue(dbUser({ sessionVersion: 3 }));
    await expect(authz.requireAuth()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects a deactivated account immediately", async () => {
    mocks.auth.mockResolvedValue(session());
    mocks.findSessionUser.mockResolvedValue(dbUser({ isActive: false }));
    await expect(authz.requireAuth()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects users of a deactivated clinic", async () => {
    mocks.auth.mockResolvedValue(session());
    mocks.findSessionUser.mockResolvedValue(dbUser({ clinic: { isActive: false } }));
    await expect(authz.requireAuth()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects a session whose user was deleted", async () => {
    mocks.auth.mockResolvedValue(session());
    mocks.findSessionUser.mockResolvedValue(null);
    await expect(authz.requireAuth()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("requirePermission / requireRole", () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue(session());
    mocks.findSessionUser.mockResolvedValue(dbUser());
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
    await expect(authz.requireRole(["DENTIST", "CLINIC_ADMIN"])).resolves.toBeTruthy();
    await expect(authz.requireRole("CLINIC_ADMIN")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("clinic and branch isolation", () => {
  it("denies cross-clinic access", () => {
    const admin = makeUser("CLINIC_ADMIN");
    expect(() => authz.assertClinicAccess(admin, CLINIC_A)).not.toThrow();
    expect(() => authz.assertClinicAccess(admin, CLINIC_B)).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(() => authz.assertClinicAccess(admin, null)).toThrow();
  });

  it("lets super admins reach any clinic", () => {
    expect(() => authz.assertClinicAccess(makeUser("SUPER_ADMIN"), CLINIC_B)).not.toThrow();
  });

  it("limits branch-scoped staff to their assigned branches", () => {
    const receptionist = makeUser("RECEPTIONIST");
    expect(() => authz.assertBranchAccess(receptionist, { id: BRANCH_A1, clinicId: CLINIC_A })).not.toThrow();
    expect(() => authz.assertBranchAccess(receptionist, { id: BRANCH_A2, clinicId: CLINIC_A })).toThrow();
  });

  it("gives clinic admins every branch of their own clinic only", () => {
    const admin = makeUser("CLINIC_ADMIN");
    expect(() => authz.assertBranchAccess(admin, { id: BRANCH_A2, clinicId: CLINIC_A })).not.toThrow();
    expect(() => authz.assertBranchAccess(admin, { id: "cbranchb1", clinicId: CLINIC_B })).toThrow();
  });

  it("requireBranchAccess treats unknown branches as forbidden (no probing)", async () => {
    mocks.auth.mockResolvedValue(session());
    mocks.findSessionUser.mockResolvedValue(dbUser());
    mocks.findBranch.mockResolvedValue(null);
    await expect(authz.requireBranchAccess(BRANCH_A2)).rejects.toMatchObject({ code: "FORBIDDEN" });
    mocks.findBranch.mockResolvedValue({ id: BRANCH_A1, clinicId: CLINIC_A, isActive: true });
    await expect(authz.requireBranchAccess(BRANCH_A1)).resolves.toBeTruthy();
  });

  it("ignores client-supplied clinic IDs for non super admins", () => {
    const admin = makeUser("CLINIC_ADMIN");
    expect(authz.resolveClinicId(admin, CLINIC_B)).toBe(CLINIC_A);
    expect(authz.resolveClinicId(makeUser("SUPER_ADMIN"), CLINIC_B)).toBe(CLINIC_B);
  });

  it("builds record scopes: clinic → branches → assigned records", () => {
    expect(authz.recordScope(makeUser("SUPER_ADMIN"))).toEqual({});
    expect(authz.recordScope(makeUser("CLINIC_ADMIN"))).toEqual({ clinicId: CLINIC_A, branchIds: undefined, assigneeId: undefined });
    expect(authz.recordScope(makeUser("RECEPTIONIST"))).toMatchObject({ clinicId: CLINIC_A, branchIds: [BRANCH_A1], assigneeId: undefined });
    const dentist = makeUser("DENTIST");
    expect(authz.recordScope(dentist)).toMatchObject({ clinicId: CLINIC_A, branchIds: [BRANCH_A1], assigneeId: dentist.id });
  });

  it("never produces an unscoped query for a clinic user missing a clinic", () => {
    expect(() => authz.recordScope(makeUser("RECEPTIONIST", { clinicId: null }))).toThrow();
  });
});
