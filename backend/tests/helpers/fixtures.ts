import type { AuthUser } from "@backend/lib/authorization";
import { permissionsFor, roleTemplate } from "@backend/config/access";
import { ROLES, type Role } from "@backend/config/permissions";

export const CLINIC_A = "00000000-0000-4000-8000-00000000000a";
export const CLINIC_B = "00000000-0000-4000-8000-00000000000b";

/** Stable UUID per role, e.g. the DENTIST test user. */
export const userIdFor = (role: Role) => `00000000-0000-4000-8000-1000000000${String(ROLES.indexOf(role)).padStart(2, "0")}`;

export function makeUser(role: Role, overrides: Partial<AuthUser> = {}): AuthUser {
  const access = roleTemplate(role);
  return {
    id: userIdFor(role),
    email: `${role.toLowerCase()}@ismile.test`,
    name: `Test ${role}`,
    role,
    clinicId: CLINIC_A,
    permissions: permissionsFor(access),
    access,
    idleSignOut: false,
    sessionId: "00000000-0000-4000-8000-200000000001",
    ...overrides,
  };
}
