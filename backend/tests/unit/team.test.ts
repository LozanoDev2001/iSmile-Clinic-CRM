import { beforeEach, describe, expect, it, vi } from "vitest";
import { grantsFromAccess, roleTemplate } from "@backend/config/access";
import type { Role } from "@backend/config/permissions";
import { CLINIC_A, CLINIC_B, makeUser } from "../helpers/fixtures";

const mocks = vi.hoisted(() => ({
  repo: {
    findMember: vi.fn(),
    findSystemRole: vi.fn(),
    setRole: vi.fn(),
    updateJobTitle: vi.fn(),
    replaceOverrides: vi.fn(),
    setStatus: vi.fn(),
  },
  revokeUserSessions: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@backend/features/users/users.repository", () => ({ usersRepository: mocks.repo }));
vi.mock("@backend/features/auth/auth.repository", () => ({ authRepository: { revokeUserSessions: mocks.revokeUserSessions } }));
vi.mock("@backend/lib/logging/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@backend/lib/logging/audit")>()),
  audit: mocks.audit,
}));
vi.mock("@backend/lib/prisma", () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({}) } }));
vi.mock("@backend/features/auth/auth.service", () => ({ revokeAllSessionsFor: vi.fn() }));
vi.mock("@backend/features/auth/password-reset.service", () => ({ sendPasswordResetEmail: vi.fn() }));

const { updateMember, unlockMember } = await import("@backend/features/users/team.service");

const MEMBER_ID = "00000000-0000-4000-8000-600000000001";

const member = (role: Role = "ACCOUNTS", overrides: Record<string, unknown> = {}) => ({
  id: MEMBER_ID,
  email: "joy@ismile.test",
  fullName: "Joy Ramirez",
  jobTitle: "Patient coordinator",
  staffCode: "FD-003",
  status: "active",
  clinicId: CLINIC_A,
  hasPassword: true,
  userRoles: [{ role: { code: role } }],
  securitySessions: [],
  roleGrants: grantsFromAccess(roleTemplate(role)),
  overrides: [],
  ...overrides,
});

const accessInput = (role: Role) =>
  Object.entries(roleTemplate(role)).map(([module, value]) => ({ module, level: value.level, tabs: value.tabs }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.repo.findMember.mockResolvedValue(member());
  mocks.repo.findSystemRole.mockImplementation(async (code: Role) => ({ id: `role-${code}`, grants: grantsFromAccess(roleTemplate(code)) }));
});

describe("updateMember", () => {
  it("stores only the allow/deny overrides that differ from the role, and audits each change", async () => {
    const access = accessInput("ACCOUNTS").map((a) => (a.module === "dash_dentist" ? { ...a, level: "VIEW" as const } : a));
    await updateMember(makeUser("OWNER"), { userId: MEMBER_ID, role: "ACCOUNTS", jobTitle: "Patient coordinator", access });

    expect(mocks.repo.replaceOverrides).toHaveBeenCalledWith(MEMBER_ID, [{ grant: "dash_dentist:view", decision: "allow" }], {});
    expect(mocks.repo.setRole).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    expect(mocks.audit.mock.calls[0][0]).toMatchObject({ action: "user.access.changed", metadata: { module: "dash_dentist", from: "NONE", to: "VIEW" } });
  });

  it("changes the role through user_roles and ends the member's sessions", async () => {
    await updateMember(makeUser("OWNER"), { userId: MEMBER_ID, role: "FRONT_DESK", jobTitle: "Patient coordinator", access: accessInput("FRONT_DESK") });
    expect(mocks.repo.setRole).toHaveBeenCalledWith(MEMBER_ID, "role-FRONT_DESK", {});
    expect(mocks.revokeUserSessions).toHaveBeenCalledWith(MEMBER_ID, {});
    expect(mocks.repo.replaceOverrides).toHaveBeenCalledWith(MEMBER_ID, [], {});
    expect(mocks.audit.mock.calls[0][0]).toMatchObject({ action: "user.role.changed", metadata: { from: "ACCOUNTS", to: "FRONT_DESK" } });
  });

  it("refuses to let someone edit their own access", async () => {
    const owner = makeUser("OWNER", { id: MEMBER_ID });
    await expect(updateMember(owner, { userId: MEMBER_ID, role: "ACCOUNTS", access: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("stops a general manager from editing an owner or another manager", async () => {
    const manager = makeUser("GENERAL_MANAGER");
    mocks.repo.findMember.mockResolvedValue(member("OWNER"));
    await expect(updateMember(manager, { userId: MEMBER_ID, role: "DENTIST", access: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    mocks.repo.findMember.mockResolvedValue(member("GENERAL_MANAGER"));
    await expect(updateMember(manager, { userId: MEMBER_ID, role: "DENTIST", access: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not let a manager hand out more than they hold", async () => {
    // Managers only have View on the owner dashboard.
    const access = accessInput("ACCOUNTS").map((a) => (a.module === "dash_owner" ? { ...a, level: "FULL" as const } : a));
    await expect(updateMember(makeUser("GENERAL_MANAGER"), { userId: MEMBER_ID, role: "ACCOUNTS", access })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.repo.replaceOverrides).not.toHaveBeenCalled();
  });

  it("hides members of other clinics", async () => {
    mocks.repo.findMember.mockResolvedValue(member("ACCOUNTS", { clinicId: CLINIC_B }));
    await expect(updateMember(makeUser("OWNER"), { userId: MEMBER_ID, role: "ACCOUNTS", access: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires users.update", async () => {
    await expect(updateMember(makeUser("ACCOUNTS"), { userId: MEMBER_ID, role: "ACCOUNTS", access: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("unlockMember", () => {
  it("reactivates a suspended account and records who unlocked it", async () => {
    mocks.repo.findMember.mockResolvedValue(member("ACCOUNTS", { status: "suspended" }));
    await unlockMember(makeUser("OWNER"), { userId: MEMBER_ID });
    expect(mocks.repo.setStatus).toHaveBeenCalledWith(MEMBER_ID, "active", {});
    expect(mocks.audit.mock.calls[0][0]).toMatchObject({ action: "user.unlocked", resourceId: MEMBER_ID });
  });

  it("does nothing for an account that is not locked", async () => {
    await unlockMember(makeUser("OWNER"), { userId: MEMBER_ID });
    expect(mocks.repo.setStatus).not.toHaveBeenCalled();
  });
});
