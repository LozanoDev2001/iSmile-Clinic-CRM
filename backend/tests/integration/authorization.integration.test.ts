/**
 * Clinic / record isolation and session revocation against a real database.
 * Requires DATABASE_URL_TEST. Skipped otherwise.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@backend/config/permissions";
import { resetDatabase, connectTestDatabase } from "../helpers/db";

const enabled = connectTestDatabase();
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string }; sessionId: string; sessionSecret: string } }));
vi.mock("@backend/lib/auth", () => ({ auth: async () => session.current }));
vi.mock("@backend/lib/email/mailer", () => ({ sendEmail: vi.fn() }));

describe.skipIf(!enabled)("authorization against the database", async () => {
  const { prisma } = await import("@backend/lib/prisma");
  const authz = await import("@backend/lib/authorization");
  const { startSession } = await import("@backend/features/auth/auth.service");
  const patients = await import("@backend/features/patients/patients.service");
  const users = await import("@backend/features/users/users.service");
  const team = await import("@backend/features/users/team.service");

  const ids: Record<string, string> = {};
  let roleIds: Map<Role, string>;

  /** Signs in through a real security_sessions row. */
  async function signInAs(key: string) {
    const started = await startSession(ids[key], false);
    session.current = { user: { id: ids[key], role: "x" }, ...started };
    return authz.requireAuth();
  }

  beforeAll(async () => {
    roleIds = await resetDatabase(prisma);
    const settings = { signIn: { lockAfterFailedLogins: true, idleSignOut: false } };
    const a = await prisma.clinic.create({ data: { name: "Clinic A", settings } });
    const b = await prisma.clinic.create({ data: { name: "Clinic B", settings } });
    Object.assign(ids, { clinicA: a.id, clinicB: b.id });

    const mk = (key: string, role: Role, clinicId: string) =>
      prisma.user
        .create({
          data: {
            email: `${key.toLowerCase()}@ismile.test`,
            fullName: key,
            status: "active",
            passwordHash: "unused",
            clinicId,
            userRoles: { create: { roleId: roleIds.get(role)! } },
          },
        })
        .then((u) => (ids[key] = u.id));
    await mk("ownerA", "OWNER", a.id);
    await mk("ownerB", "OWNER", b.id);
    await mk("dentistA", "DENTIST", a.id);
    await mk("frontDeskA", "FRONT_DESK", a.id);

    const p = (key: string, clinicId: string, primaryDentistId?: string) =>
      prisma.contact
        .create({ data: { clinicId, contactType: "patient", fullName: key } })
        .then((c) =>
          prisma.patient.create({ data: { clinicId, contactId: c.id, patientNo: key, medicalAlerts: "Latex", primaryDentistId } }),
        )
        .then((x) => (ids[key] = x.id));
    await p("pA-assigned", a.id, ids.dentistA);
    await p("pA", a.id);
    await p("pB", b.id);
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

  it("limits patient lists by clinic and assignment", async () => {
    const names = async (key: string) => (await patients.listPatients(await signInAs(key), {})).items.map((x) => x.fullName).sort();
    expect(await names("ownerA")).toEqual(["pA", "pA-assigned"]);
    expect(await names("ownerB")).toEqual(["pB"]);
    expect(await names("frontDeskA")).toEqual(["pA", "pA-assigned"]);
    expect(await names("dentistA")).toEqual(["pA-assigned"]);
  });

  it("never returns another clinic's patient", async () => {
    const owner = await signInAs("ownerA");
    await expect(patients.getPatient(owner, ids.pB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns medical fields only with patients.medical.read, and audits the read", async () => {
    const frontDesk = await signInAs("frontDeskA");
    const basic = await patients.getPatient(frontDesk, ids["pA-assigned"]);
    expect(basic).not.toHaveProperty("medicalAlerts");

    const dentist = await signInAs("dentistA");
    const full = await patients.getPatient(dentist, ids["pA-assigned"]);
    expect(full).toMatchObject({ medicalAlerts: "Latex" });
    expect(await prisma.auditLog.count({ where: { action: "patient.medical.viewed", entityId: ids["pA-assigned"] } })).toBe(1);
    // ...but not for a patient not assigned to them.
    await expect(patients.getPatient(dentist, ids.pA)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("blocks cross-clinic user administration", async () => {
    const ownerB = await signInAs("ownerB");
    await expect(users.setUserActive(ownerB, { userId: ids.frontDeskA, active: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("applies a saved window override on the next request", async () => {
    const owner = await signInAs("ownerA");
    const before = await signInAs("frontDeskA");
    expect(before.permissions).toContain("billing.read");

    const access = (await team.getMemberAccess(owner, { userId: ids.frontDeskA })).access;
    await team.updateMember(owner, {
      userId: ids.frontDeskA,
      role: "FRONT_DESK",
      access: Object.entries({ ...access, billing: { level: "NONE" as const, tabs: [] } }).map(([module, v]) => ({ module, level: v.level, tabs: v.tabs })),
    });
    expect(await prisma.userPermissionOverride.count({ where: { userId: ids.frontDeskA, decision: "deny" } })).toBeGreaterThan(0);

    const after = await signInAs("frontDeskA");
    expect(after.permissions).not.toContain("billing.read");
  });

  it("revokes a deactivated user's existing session immediately", async () => {
    await signInAs("frontDeskA");
    const frontDeskSession = session.current;

    const owner = await signInAs("ownerA");
    await users.setUserActive(owner, { userId: ids.frontDeskA, active: false });

    session.current = frontDeskSession;
    await expect(authz.requireAuth()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(await prisma.auditLog.count({ where: { action: "user.deactivated", entityId: ids.frontDeskA } })).toBe(1);

    // Reactivating does not resurrect the old session.
    await users.setUserActive(owner, { userId: ids.frontDeskA, active: true });
    session.current = frontDeskSession;
    await expect(authz.requireAuth()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects a second account with the same email in one clinic", async () => {
    const owner = await signInAs("ownerA");
    await expect(users.inviteUser(owner, { name: "Dup", email: "frontdeska@ismile.test", role: "FRONT_DESK" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});
