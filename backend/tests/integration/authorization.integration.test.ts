/**
 * Clinic / branch / record isolation against a real MySQL database.
 * Requires DATABASE_URL_TEST. Skipped otherwise.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, connectTestDatabase } from "../helpers/db";

const enabled = connectTestDatabase();
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string }; sessionVersion: number } }));
vi.mock("@backend/lib/auth", () => ({ auth: async () => session.current }));
vi.mock("@backend/lib/email/mailer", () => ({ sendEmail: vi.fn() }));

describe.skipIf(!enabled)("authorization against MySQL", async () => {
  const { prisma } = await import("@backend/lib/prisma");
  const authz = await import("@backend/lib/authorization");
  const patients = await import("@backend/features/patients/patients.service");
  const users = await import("@backend/features/users/users.service");

  const ids: Record<string, string> = {};

  async function signInAs(key: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ids[key] } });
    session.current = { user: { id: user.id, role: user.role }, sessionVersion: user.sessionVersion };
    return authz.requireAuth();
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    const a = await prisma.clinic.create({ data: { name: "Clinic A" } });
    const b = await prisma.clinic.create({ data: { name: "Clinic B" } });
    const a1 = await prisma.branch.create({ data: { name: "A1", clinicId: a.id } });
    const a2 = await prisma.branch.create({ data: { name: "A2", clinicId: a.id } });
    const b1 = await prisma.branch.create({ data: { name: "B1", clinicId: b.id } });
    Object.assign(ids, { clinicA: a.id, clinicB: b.id, a1: a1.id, a2: a2.id, b1: b1.id });

    const mk = (key: string, role: "CLINIC_ADMIN" | "DENTIST" | "RECEPTIONIST", clinicId: string, branchIds: string[] = []) =>
      prisma.user
        .create({
          data: { email: `${key.toLowerCase()}@ismile.test`, name: key, role, clinicId, branches: { create: branchIds.map((branchId) => ({ branchId })) } },
        })
        .then((u) => (ids[key] = u.id));
    await mk("adminA", "CLINIC_ADMIN", a.id);
    await mk("adminB", "CLINIC_ADMIN", b.id);
    await mk("dentistA", "DENTIST", a.id, [a1.id]);
    await mk("receptionA", "RECEPTIONIST", a.id, [a1.id]);

    const p = (key: string, clinicId: string, branchId: string, primaryDentistId?: string) =>
      prisma.patient
        .create({ data: { clinicId, branchId, firstName: key, lastName: "Test", allergies: "Latex", medicalNotes: "Sensitive", primaryDentistId } })
        .then((x) => (ids[key] = x.id));
    await p("pA1assigned", a.id, a1.id, ids.dentistA);
    await p("pA1", a.id, a1.id);
    await p("pA2", a.id, a2.id);
    await p("pB1", b.id, b1.id);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    session.current = null;
  });

  it("rejects unauthenticated access", async () => {
    await expect(authz.requireAuth()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("limits patient lists by clinic, branch and assignment", async () => {
    const names = async (key: string) =>
      (await patients.listPatients(await signInAs(key), {})).items.map((x) => x.firstName).sort();
    expect(await names("adminA")).toEqual(["pA1", "pA1assigned", "pA2"]);
    expect(await names("adminB")).toEqual(["pB1"]);
    expect(await names("receptionA")).toEqual(["pA1", "pA1assigned"]);
    expect(await names("dentistA")).toEqual(["pA1assigned"]);
  });

  it("never returns another clinic's patient", async () => {
    const admin = await signInAs("adminA");
    await expect(patients.getPatient(admin, ids.pB1)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns medical fields only with patients.medical.read, and audits the read", async () => {
    const reception = await signInAs("receptionA");
    const basic = await patients.getPatient(reception, ids.pA1assigned);
    expect(basic).not.toHaveProperty("allergies");
    expect(basic).not.toHaveProperty("medicalNotes");

    const dentist = await signInAs("dentistA");
    const full = await patients.getPatient(dentist, ids.pA1assigned);
    expect(full).toMatchObject({ allergies: "Latex" });
    expect(await prisma.auditLog.count({ where: { action: "patient.medical.viewed", resourceId: ids.pA1assigned } })).toBe(1);
    // ...but not for a patient not assigned to them.
    await expect(patients.getPatient(dentist, ids.pA1)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("enforces branch access", async () => {
    await signInAs("receptionA");
    await expect(authz.requireBranchAccess(ids.a1)).resolves.toBeTruthy();
    await expect(authz.requireBranchAccess(ids.a2)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await signInAs("adminA");
    await expect(authz.requireBranchAccess(ids.a2)).resolves.toBeTruthy();
    await expect(authz.requireBranchAccess(ids.b1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks cross-clinic user administration", async () => {
    const adminB = await signInAs("adminB");
    await expect(users.setUserActive(adminB, { userId: ids.receptionA, active: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("revokes a deactivated user's existing session immediately", async () => {
    await signInAs("receptionA");
    const receptionSession = session.current;

    const admin = await signInAs("adminA");
    await users.setUserActive(admin, { userId: ids.receptionA, active: false });

    session.current = receptionSession;
    await expect(authz.requireAuth()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(await prisma.auditLog.count({ where: { action: "user.deactivated", resourceId: ids.receptionA } })).toBe(1);

    // Reactivating does not resurrect the old session.
    await users.setUserActive(admin, { userId: ids.receptionA, active: true });
    session.current = receptionSession;
    await expect(authz.requireAuth()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects branch IDs from another clinic when inviting", async () => {
    const admin = await signInAs("adminA");
    await expect(
      users.inviteUser(admin, { name: "New Hire", email: "new@ismile.test", role: "RECEPTIONIST", branchIds: [ids.b1] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("maps duplicate emails to CONFLICT", async () => {
    const admin = await signInAs("adminA");
    await expect(
      users.inviteUser(admin, { name: "Dup", email: "receptiona@ismile.test", role: "RECEPTIONIST", branchIds: [ids.a1] }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
