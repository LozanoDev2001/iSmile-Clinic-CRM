import type { AuthUser } from "@backend/lib/authorization";
import { getPermissions } from "@backend/config/permissions";
import type { Role } from "@backend/generated/prisma/enums";

export const CLINIC_A = "cclinicaaaaaaaaaaaaaaaaaa";
export const CLINIC_B = "cclinicbbbbbbbbbbbbbbbbbb";
export const BRANCH_A1 = "cbrancha1aaaaaaaaaaaaaaaa";
export const BRANCH_A2 = "cbrancha2aaaaaaaaaaaaaaaa";

export function makeUser(role: Role, overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: `cuser${role.toLowerCase().replace(/_/g, "")}`.padEnd(25, "0").slice(0, 25),
    email: `${role.toLowerCase()}@ismile.test`,
    name: `Test ${role}`,
    role,
    clinicId: role === "SUPER_ADMIN" ? null : CLINIC_A,
    branchIds: role === "SUPER_ADMIN" || role === "CLINIC_ADMIN" ? [] : [BRANCH_A1],
    permissions: getPermissions(role),
    ...overrides,
  };
}
