import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@backend/lib/authorization";
import { BRANCH_A1, CLINIC_A, makeUser } from "../helpers/fixtures";

const mocks = vi.hoisted(() => ({
  currentUser: null as AuthUser | null,
  list: vi.fn(),
  findById: vi.fn(),
  audit: vi.fn(),
  signOut: vi.fn(),
  signIn: vi.fn(),
}));

// Authentication is resolved from a mocked session → user lookup.
vi.mock("@backend/lib/authorization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@backend/lib/authorization")>();
  return {
    ...actual,
    getCurrentUser: async () => mocks.currentUser,
    requireAuth: async () => {
      if (!mocks.currentUser) throw new (await import("@backend/lib/errors/app-error")).AppError("UNAUTHENTICATED");
      return mocks.currentUser;
    },
  };
});
vi.mock("@backend/lib/auth", () => ({ auth: vi.fn(), signIn: mocks.signIn, signOut: mocks.signOut }));
vi.mock("@backend/lib/prisma", () => ({ prisma: {} }));
vi.mock("@backend/features/patients/patients.repository", () => ({
  patientsRepository: { list: mocks.list, findById: mocks.findById },
}));
vi.mock("@backend/lib/logging/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@backend/lib/logging/audit")>()),
  audit: mocks.audit,
}));

const { listPatientsHandler, getPatientHandler } = await import("@backend/features/patients/patients.controller");
const authActions = await import("@backend/features/auth/auth.controller");
const usersActions = await import("@backend/features/users/users.controller");
const { userListSelect } = await import("@backend/features/users/users.repository");
const { AuthError, CredentialsSignin } = await import("next-auth");

const PATIENT_ID = "cpatient00000000000000001";
const get = (url: string) => new NextRequest(`http://localhost:3000${url}`);
const ctx = <P>(params: P) => ({ params: Promise.resolve(params) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUser = null;
  mocks.list.mockResolvedValue({ items: [], total: 0 });
});

describe("protected API routes", () => {
  it("returns 401 without a session", async () => {
    const res = await listPatientsHandler(get("/api/patients"), ctx({}));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("returns 403 for a role without patients.read", async () => {
    mocks.currentUser = makeUser("CRM_STAFF");
    const res = await listPatientsHandler(get("/api/patients"), ctx({}));
    expect(res.status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("scopes the query to the caller's clinic and branches", async () => {
    mocks.currentUser = makeUser("RECEPTIONIST");
    const res = await listPatientsHandler(get("/api/patients?page=2&pageSize=10&search=smi"), ctx({}));
    expect(res.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(
      { clinicId: CLINIC_A, branchIds: [BRANCH_A1], assigneeId: undefined },
      { page: 2, pageSize: 10, search: "smi" },
    );
  });

  it("rejects invalid query input and identifiers before hitting the database", async () => {
    mocks.currentUser = makeUser("RECEPTIONIST");
    const bad = await listPatientsHandler(get("/api/patients?pageSize=5000"), ctx({}));
    expect(bad.status).toBe(400);
    const badId = await getPatientHandler(get("/api/patients/1%20OR%201=1"), ctx({ id: "1 OR 1=1" }));
    expect(badId.status).toBe(400);
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it("returns 404 for records outside the caller's scope", async () => {
    mocks.currentUser = makeUser("RECEPTIONIST");
    mocks.findById.mockResolvedValue(null);
    const res = await getPatientHandler(get(`/api/patients/${PATIENT_ID}`), ctx({ id: PATIENT_ID }));
    expect(res.status).toBe(404);
  });
});

describe("medical record permission enforcement", () => {
  it("does not request medical fields for non-clinical roles", async () => {
    mocks.currentUser = makeUser("RECEPTIONIST");
    mocks.findById.mockResolvedValue({ id: PATIENT_ID, clinicId: CLINIC_A, firstName: "Maria" });
    const res = await getPatientHandler(get(`/api/patients/${PATIENT_ID}`), ctx({ id: PATIENT_ID }));
    expect(res.status).toBe(200);
    expect(mocks.findById).toHaveBeenCalledWith(expect.anything(), PATIENT_ID, { includeMedical: false });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("includes medical fields for dentists, scoped to their patients, and audits the read", async () => {
    const dentist = makeUser("DENTIST");
    mocks.currentUser = dentist;
    mocks.findById.mockResolvedValue({ id: PATIENT_ID, clinicId: CLINIC_A, allergies: "Penicillin" });
    const res = await getPatientHandler(get(`/api/patients/${PATIENT_ID}`), ctx({ id: PATIENT_ID }));
    expect(res.status).toBe(200);
    expect(mocks.findById).toHaveBeenCalledWith(
      { clinicId: CLINIC_A, branchIds: [BRANCH_A1], assigneeId: dentist.id },
      PATIENT_ID,
      { includeMedical: true },
    );
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "patient.medical.viewed", resourceId: PATIENT_ID }));
  });
});

describe("protected Server Actions", () => {
  it("refuse to run without a session", async () => {
    const profile = await authActions.updateProfileAction({ name: "Mallory" });
    expect(profile).toMatchObject({ success: false, error: { code: "UNAUTHENTICATED" } });
    const invite = await usersActions.inviteUserAction({ name: "Eve", email: "eve@x.test", role: "DENTIST", branchIds: [] });
    expect(invite).toMatchObject({ success: false, error: { code: "UNAUTHENTICATED" } });
    const revoke = await authActions.revokeAllSessionsAction();
    expect(revoke).toMatchObject({ success: false, error: { code: "UNAUTHENTICATED" } });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("refuse users lacking the permission", async () => {
    mocks.currentUser = makeUser("RECEPTIONIST");
    const invite = await usersActions.inviteUserAction({ name: "Eve", email: "eve@x.test", role: "DENTIST", branchIds: [] });
    expect(invite).toMatchObject({ success: false, error: { code: "FORBIDDEN" } });
    const toggle = await usersActions.setUserActiveAction({ userId: "cuser00000000000000000009", active: false });
    expect(toggle).toMatchObject({ success: false, error: { code: "FORBIDDEN" } });
  });

  it("refuse privilege escalation (clinic admin creating a super admin)", async () => {
    mocks.currentUser = makeUser("CLINIC_ADMIN");
    const invite = await usersActions.inviteUserAction({ name: "Eve", email: "eve@x.test", role: "SUPER_ADMIN", branchIds: [] });
    expect(invite).toMatchObject({ success: false, error: { code: "FORBIDDEN" } });
  });

  it("validate input on the server", async () => {
    mocks.currentUser = makeUser("DENTIST");
    const profile = await authActions.updateProfileAction({ name: "" });
    expect(profile).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR", fields: { name: expect.any(Array) } } });
  });
});

describe("DTOs", () => {
  it("never select password hashes for user listings", () => {
    expect(userListSelect.passwordHash).toBe(false);
    expect(Object.entries(userListSelect).filter(([, v]) => v === true).map(([k]) => k)).not.toContain("passwordHash");
  });
});

describe("loginAction outcomes", () => {
  const valid = { email: "dana@ismile.test", password: "anything" };

  it("validates input before contacting Auth.js", async () => {
    const result = await authActions.loginAction({ email: "bad", password: "" });
    expect(result).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("returns a generic message for bad credentials", async () => {
    mocks.signIn.mockRejectedValueOnce(new CredentialsSignin());
    await expect(authActions.loginAction(valid)).resolves.toMatchObject({
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Invalid email or password." },
    });
  });

  it("reports throttling", async () => {
    const limited = new CredentialsSignin();
    limited.code = "rate_limited";
    mocks.signIn.mockRejectedValueOnce(limited);
    await expect(authActions.loginAction(valid)).resolves.toMatchObject({ success: false, error: { code: "RATE_LIMITED" } });
  });

  it("does not blame the password when the system fails", async () => {
    mocks.signIn.mockRejectedValueOnce(new AuthError("CallbackRouteError"));
    await expect(authActions.loginAction(valid)).resolves.toMatchObject({ success: false, error: { code: "DATABASE_ERROR" } });
  });

  it("passes only safe callback URLs to Auth.js", async () => {
    mocks.signIn.mockResolvedValueOnce(undefined);
    await authActions.loginAction({ ...valid, callbackUrl: "https://evil.example/phish" });
    expect(mocks.signIn).toHaveBeenCalledWith("credentials", expect.objectContaining({ redirectTo: "/dashboard" }));
  });
});
