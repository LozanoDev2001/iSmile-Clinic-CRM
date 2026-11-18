import "server-only";
import { effectiveAccess, grantKey, permissionsFor } from "@backend/config/access";
import { isRole, type Permission } from "@backend/config/permissions";
import type { NamedRef } from "@backend/features/patients/patients.types";
import { prisma, type TransactionClient } from "@backend/lib/prisma";
import { staffRepository } from "./staff.repository";

/** Active staff whose access (role plus overrides) includes `permission`, e.g. who a lead or chat can be assigned to. */
export async function staffWithPermission(clinicId: string, permission: Permission, tx: TransactionClient = prisma): Promise<NamedRef[]> {
  const rows = await staffRepository.activeWithAccess(clinicId, tx);
  return rows.flatMap((u) => {
    const code = u.userRoles[0]?.role.code;
    if (!code || !isRole(code)) return [];
    const grants = u.userRoles[0].role.rolePermissions.map((rp) => grantKey(rp.permission.resource, rp.permission.action));
    const overrides = u.userPermissionOverrides.map((o) => ({ grant: grantKey(o.permission.resource, o.permission.action), decision: o.decision === "deny" ? ("deny" as const) : ("allow" as const) }));
    return permissionsFor(effectiveAccess(code, grants, overrides)).includes(permission) ? [{ id: u.id, name: u.fullName }] : [];
  });
}
