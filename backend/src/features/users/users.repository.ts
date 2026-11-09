import "server-only";
import { grantKey, type GrantKey, type GrantOverride } from "@backend/config/access";
import type { Role } from "@backend/config/permissions";
import type { UserStatus } from "@backend/config/statuses";
import type { Prisma } from "@backend/generated/prisma/client";
import { prisma, type TransactionClient } from "@backend/lib/prisma";

const grantSelect = { permission: { select: { resource: true, action: true } } } as const;

/** Public-safe staff fields. Never add `passwordHash` here. */
export const teamMemberSelect = {
  id: true,
  email: true,
  fullName: true,
  jobTitle: true,
  staffCode: true,
  status: true,
  clinicId: true,
  userRoles: { select: { role: { select: { code: true } } }, take: 1 },
  securitySessions: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
} as const satisfies Prisma.UserSelect;

export type TeamMemberRow = Prisma.UserGetPayload<{ select: typeof teamMemberSelect }>;

const toGrants = (rows: { permission: { resource: string; action: string } }[]): GrantKey[] =>
  rows.map((r) => grantKey(r.permission.resource, r.permission.action));

export const usersRepository = {
  listTeam(clinicId: string) {
    return prisma.user.findMany({ where: { clinicId }, select: teamMemberSelect, orderBy: { fullName: "asc" } });
  },

  /** Member plus their role grants and allow/deny overrides. */
  async findMember(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        ...teamMemberSelect,
        passwordHash: true,
        userRoles: { select: { role: { select: { code: true, rolePermissions: { select: grantSelect } } } }, take: 1 },
        userPermissionOverrides: { select: { decision: true, ...grantSelect } },
      },
    });
    if (!user) return null;
    const { passwordHash, userPermissionOverrides, ...rest } = user;
    return {
      ...rest,
      hasPassword: passwordHash !== null,
      roleGrants: toGrants(user.userRoles[0]?.role.rolePermissions ?? []),
      overrides: userPermissionOverrides.map((o) => ({
        grant: grantKey(o.permission.resource, o.permission.action),
        decision: o.decision === "deny" ? ("deny" as const) : ("allow" as const),
      })),
    };
  },

  /** System role (clinic_id NULL) with its template grants. */
  async findSystemRole(code: Role, tx: TransactionClient = prisma) {
    const role = await tx.role.findFirst({
      where: { code, clinicId: null },
      select: { id: true, rolePermissions: { select: grantSelect } },
    });
    return role && { id: role.id, grants: toGrants(role.rolePermissions) };
  },

  async permissionIds(grants: GrantKey[], tx: TransactionClient = prisma): Promise<Map<GrantKey, string>> {
    if (!grants.length) return new Map();
    const rows = await tx.permission.findMany({
      where: { OR: grants.map((g) => ({ resource: g.slice(0, g.indexOf(":")), action: g.slice(g.indexOf(":") + 1) })) },
      select: { id: true, resource: true, action: true },
    });
    return new Map(rows.map((p) => [grantKey(p.resource, p.action), p.id]));
  },

  emailTaken(clinicId: string, email: string) {
    return prisma.user.count({ where: { clinicId, email } }).then((n) => n > 0);
  },

  create(data: { clinicId: string; fullName: string; email: string; jobTitle: string | null; roleId: string }, tx: TransactionClient) {
    return tx.user.create({
      data: {
        clinicId: data.clinicId,
        fullName: data.fullName,
        email: data.email,
        jobTitle: data.jobTitle,
        status: "invited" satisfies UserStatus,
        userRoles: { create: { roleId: data.roleId } },
      },
      select: { id: true, email: true, fullName: true },
    });
  },

  updateJobTitle(id: string, jobTitle: string | null, tx: TransactionClient) {
    return tx.user.update({ where: { id }, data: { jobTitle }, select: { id: true } });
  },

  /** Members hold exactly one role. */
  async setRole(userId: string, roleId: string, tx: TransactionClient) {
    await tx.userRole.deleteMany({ where: { userId } });
    await tx.userRole.create({ data: { userId, roleId } });
  },

  async replaceOverrides(userId: string, overrides: GrantOverride[], tx: TransactionClient) {
    await tx.userPermissionOverride.deleteMany({ where: { userId } });
    if (!overrides.length) return;
    const ids = await this.permissionIds(overrides.map((o) => o.grant), tx);
    // Every grant comes from config/access.ts and is seeded; a gap means the seed is out of date.
    if (overrides.some((o) => !ids.has(o.grant))) throw new Error("Permission rows are missing; re-run the seed.");
    await tx.userPermissionOverride.createMany({
      data: overrides.map((o) => ({ userId, permissionId: ids.get(o.grant) as string, decision: o.decision })),
    });
  },

  setStatus(id: string, status: UserStatus, tx: TransactionClient) {
    return tx.user.update({ where: { id }, data: { status }, select: { id: true } });
  },

  recentAudit(where: Prisma.AuditLogWhereInput, take: number) {
    return prisma.auditLog.findMany({
      where,
      select: { id: true, action: true, actorId: true, entityId: true, afterData: true, occurredAt: true },
      orderBy: { occurredAt: "desc" },
      take,
    });
  },

  names(ids: string[]) {
    return prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } });
  },
};
