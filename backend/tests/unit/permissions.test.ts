import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
  getPermissions,
  hasPermission,
  isPermission,
} from "@backend/config/permissions";

describe("role → permission mapping", () => {
  it("only grants permissions that are defined centrally", () => {
    for (const role of ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) expect(isPermission(permission)).toBe(true);
    }
  });

  it("gives Super Admin every permission", () => {
    for (const permission of PERMISSIONS) expect(hasPermission("SUPER_ADMIN", permission)).toBe(true);
  });

  it("restricts medical records to clinical roles", () => {
    expect(hasPermission("DENTIST", "patients.medical.read")).toBe(true);
    expect(hasPermission("DENTIST", "patients.medical.update")).toBe(true);
    for (const role of ["CLINIC_ADMIN", "RECEPTIONIST", "FINANCE_STAFF", "CRM_STAFF"] as const) {
      expect(hasPermission(role, "patients.medical.read")).toBe(false);
      expect(hasPermission(role, "patients.medical.update")).toBe(false);
    }
  });

  it("applies least privilege to non-clinical roles", () => {
    expect(hasPermission("RECEPTIONIST", "billing.read")).toBe(false);
    expect(hasPermission("RECEPTIONIST", "appointments.cancel")).toBe(true);
    expect(hasPermission("FINANCE_STAFF", "billing.update")).toBe(true);
    expect(hasPermission("FINANCE_STAFF", "appointments.create")).toBe(false);
    expect(getPermissions("CRM_STAFF").every((p) => p.startsWith("leads."))).toBe(true);
    expect(hasPermission("DENTIST", "users.create")).toBe(false);
  });

  it("only lets administrators manage users", () => {
    const managers = ROLES.filter((r) => hasPermission(r, "users.create"));
    expect(managers.sort()).toEqual(["CLINIC_ADMIN", "SUPER_ADMIN"]);
  });

  it("prevents clinic admins from creating super admins", () => {
    expect(ASSIGNABLE_ROLES.CLINIC_ADMIN).not.toContain("SUPER_ADMIN");
    expect(ASSIGNABLE_ROLES.SUPER_ADMIN).toContain("SUPER_ADMIN");
    expect(ASSIGNABLE_ROLES.RECEPTIONIST).toHaveLength(0);
  });

  it("returns copies so callers cannot mutate the central definition", () => {
    const perms = getPermissions("DENTIST");
    perms.push("users.create");
    expect(hasPermission("DENTIST", "users.create")).toBe(false);
  });
});
