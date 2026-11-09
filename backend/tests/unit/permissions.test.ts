import { describe, expect, it } from "vitest";
import {
  MODULE_KEYS,
  accessFromGrants,
  allGrants,
  effectiveAccess,
  exceedsLevel,
  getPermissions,
  grantsFromAccess,
  moduleTabs,
  overridesFor,
  permissionsFor,
  roleTemplate,
} from "@backend/config/access";
import { ASSIGNABLE_ROLES, PERMISSIONS, ROLES, isPermission } from "@backend/config/permissions";

const has = (role: (typeof ROLES)[number], permission: (typeof PERMISSIONS)[number]) => getPermissions(role).includes(permission);

describe("role templates → permissions", () => {
  it("only grants permissions that are defined centrally", () => {
    for (const role of ROLES) for (const permission of getPermissions(role)) expect(isPermission(permission)).toBe(true);
  });

  it("gives the Owner every permission", () => {
    for (const permission of PERMISSIONS) expect(has("OWNER", permission)).toBe(true);
  });

  it("unlocks medical records only through the Visit history tab", () => {
    expect(has("DENTIST", "patients.medical.read")).toBe(true);
    expect(has("DENTIST", "patients.medical.update")).toBe(true);
    expect(has("DENTAL_ASSISTANT", "patients.medical.read")).toBe(true);
    expect(has("DENTAL_ASSISTANT", "patients.medical.update")).toBe(false);
    for (const role of ["FRONT_DESK", "ACCOUNTS"] as const) {
      expect(has(role, "patients.read")).toBe(true);
      expect(has(role, "patients.medical.read")).toBe(false);
    }
  });

  it("matches the Accounts template from the design", () => {
    const access = roleTemplate("ACCOUNTS");
    expect(access.billing).toEqual({ level: "FULL", tabs: moduleTabs("billing") });
    expect(access.reports.level).toBe("FULL");
    expect(access.patients).toEqual({ level: "VIEW", tabs: ["overview"] });
    expect(access.contacts).toEqual({ level: "VIEW", tabs: moduleTabs("contacts") });
    expect(access.calendar.level).toBe("VIEW");
    for (const key of ["dash_owner", "crwdforce", "leads", "messaging", "settings"] as const) expect(access[key]).toEqual({ level: "NONE", tabs: [] });
  });

  it("applies least privilege to front-line roles", () => {
    expect(has("FRONT_DESK", "billing.read")).toBe(true);
    expect(has("FRONT_DESK", "billing.update")).toBe(false);
    expect(has("FRONT_DESK", "appointments.cancel")).toBe(true);
    expect(has("ACCOUNTS", "appointments.create")).toBe(false);
    expect(has("DENTAL_ASSISTANT", "patients.update")).toBe(false);
  });

  it("lets only owners and managers manage staff by default", () => {
    const managers = ROLES.filter((r) => has(r, "users.create"));
    expect(managers.sort()).toEqual(["GENERAL_MANAGER", "OWNER"]);
  });
});

describe("per-user overrides (user_permission_overrides)", () => {
  const dentistGrants = grantsFromAccess(roleTemplate("DENTIST"));

  it("round-trips window access through permission grants", () => {
    for (const role of ROLES) expect(accessFromGrants(grantsFromAccess(roleTemplate(role)))).toEqual(roleTemplate(role));
  });

  it("allows and denies single grants on top of the role", () => {
    const access = effectiveAccess("DENTIST", dentistGrants, [
      { grant: "billing:view", decision: "allow" },
      { grant: "patients:tab:visit_history", decision: "deny" },
    ]);
    expect(access.billing.level).toBe("VIEW");
    expect(access.patients.tabs).not.toContain("visit_history");
    expect(permissionsFor(access)).not.toContain("patients.medical.read");
  });

  it("computes the minimal overrides for a wanted access map", () => {
    const wanted = roleTemplate("DENTIST");
    wanted.dash_owner = { level: "VIEW", tabs: [] };
    wanted.messaging = { level: "NONE", tabs: [] };
    expect(overridesFor(dentistGrants, wanted).sort((a, b) => a.grant.localeCompare(b.grant))).toEqual([
      { grant: "dash_owner:view", decision: "allow" },
      { grant: "messaging:view", decision: "deny" },
    ]);
    expect(effectiveAccess("DENTIST", dentistGrants, overridesFor(dentistGrants, wanted))).toEqual(wanted);
  });

  it("never narrows Owner access", () => {
    const owner = grantsFromAccess(roleTemplate("OWNER"));
    expect(effectiveAccess("OWNER", owner, [{ grant: "billing:view", decision: "deny" }]).billing.level).toBe("FULL");
  });

  it("covers every grant with a permissions row", () => {
    const rows = new Set(allGrants().map((g) => `${g.resource}:${g.action}`));
    for (const role of ROLES) for (const g of grantsFromAccess(roleTemplate(role))) expect(rows.has(g)).toBe(true);
    expect(MODULE_KEYS.every((m) => rows.has(`${m}:view`) && rows.has(`${m}:full`))).toBe(true);
  });

  it("ranks access levels", () => {
    expect(exceedsLevel("FULL", "VIEW")).toBe(true);
    expect(exceedsLevel("VIEW", "VIEW")).toBe(false);
    expect(exceedsLevel("NONE", "FULL")).toBe(false);
  });
});

describe("assignable roles", () => {
  it("never lets anyone create or manage an owner from the app", () => {
    for (const role of ROLES) expect(ASSIGNABLE_ROLES[role]).not.toContain("OWNER");
  });

  it("stops managers from managing other managers, and staff from managing anyone", () => {
    expect(ASSIGNABLE_ROLES.OWNER).toContain("GENERAL_MANAGER");
    expect(ASSIGNABLE_ROLES.GENERAL_MANAGER).not.toContain("GENERAL_MANAGER");
    for (const role of ["DENTIST", "FRONT_DESK", "ACCOUNTS", "DENTAL_ASSISTANT"] as const) expect(ASSIGNABLE_ROLES[role]).toHaveLength(0);
  });
});
