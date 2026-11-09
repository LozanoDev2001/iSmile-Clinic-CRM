import { allGrants, grantKey, grantsFromAccess, roleTemplate } from "../src/config/access";
import { ROLES, ROLE_LABELS, type Role } from "../src/config/permissions";
import type { PrismaClient } from "../src/generated/prisma/client";

/**
 * Writes every grant to `permissions` and every system role (clinic_id NULL)
 * with its window template to `role_permissions`. Idempotent: role templates
 * are re-synced from src/config/access.ts on every run.
 */
export async function seedAccessModel(prisma: PrismaClient): Promise<Map<Role, string>> {
  const permissionIds = new Map<string, string>();
  for (const { resource, action } of allGrants()) {
    const row = await prisma.permission.upsert({
      where: { resource_action: { resource, action } },
      update: {},
      create: { resource, action },
      select: { id: true },
    });
    permissionIds.set(grantKey(resource, action), row.id);
  }

  const roleIds = new Map<Role, string>();
  for (const code of ROLES) {
    const existing = await prisma.role.findFirst({ where: { code, clinicId: null }, select: { id: true } });
    const role = existing ?? (await prisma.role.create({ data: { code, name: ROLE_LABELS[code] }, select: { id: true } }));
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: grantsFromAccess(roleTemplate(code)).map((grant) => ({ roleId: role.id, permissionId: permissionIds.get(grant) as string })),
    });
    roleIds.set(code, role.id);
  }
  return roleIds;
}
