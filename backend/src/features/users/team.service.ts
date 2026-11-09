import "server-only";
import {
  ACCESS_LEVEL_LABELS,
  FIXED_ACCESS_ROLES,
  MODULES,
  MODULE_KEYS,
  effectiveAccess,
  exceedsLevel,
  moduleTabs,
  overridesFor,
  roleTemplate,
  type AccessLevel,
  type AccessMap,
  type ModuleKey,
} from "@backend/config/access";
import { ASSIGNABLE_ROLES, ROLE_LABELS, isRole, type Role } from "@backend/config/permissions";
import { authRepository } from "@backend/features/auth/auth.repository";
import { revokeAllSessionsFor } from "@backend/features/auth/auth.service";
import { sendPasswordResetEmail } from "@backend/features/auth/password-reset.service";
import { assertClinicAccess, assertPermission, can, type AuthUser } from "@backend/lib/authorization";
import { Errors } from "@backend/lib/errors/app-error";
import { AUDIT_ACTIONS, audit, type AuditAction } from "@backend/lib/logging/audit";
import { prisma } from "@backend/lib/prisma";
import { memberIdSchema, updateMemberSchema } from "./user.schema";
import { usersRepository, type TeamMemberRow } from "./users.repository";
import type { AccessLogEntry, MemberAccessDetail, MemberIdInput, TeamMember, TeamOverview, UpdateMemberInput } from "./users.types";

const ACCESS_LOG_SIZE = 12;

function roleOf(row: Pick<TeamMemberRow, "userRoles">): Role {
  const code = row.userRoles[0]?.role.code;
  if (!code || !isRole(code)) throw new Error("User has no valid role");
  return code;
}

function canEditRole(actor: AuthUser, role: Role) {
  return can(actor, "users.update") && ASSIGNABLE_ROLES[actor.role].includes(role);
}

function toTeamMember(actor: AuthUser, row: TeamMemberRow): TeamMember {
  const role = roleOf(row);
  return {
    id: row.id,
    name: row.fullName,
    email: row.email,
    role,
    jobTitle: row.jobTitle,
    staffCode: row.staffCode,
    status: row.status === "disabled" ? "DEACTIVATED" : row.status === "invited" ? "INVITED" : "ACTIVE",
    locked: row.status === "suspended",
    lastLoginAt: row.securitySessions[0]?.createdAt ?? null,
    editable: row.id !== actor.id && canEditRole(actor, role),
  };
}

export async function getTeamOverview(actor: AuthUser): Promise<TeamOverview> {
  assertPermission(actor, "users.read");
  const members = (await usersRepository.listTeam(actor.clinicId)).map((row) => toTeamMember(actor, row));
  return { members, activeCount: members.filter((m) => m.status === "ACTIVE").length };
}

async function findMemberInScope(actor: AuthUser, userId: string) {
  const user = await usersRepository.findMember(userId);
  if (!user) throw Errors.notFound("user");
  assertClinicAccess(actor, user.clinicId);
  return { ...user, role: roleOf(user) };
}

export async function getMemberAccess(actor: AuthUser, input: MemberIdInput): Promise<MemberAccessDetail> {
  assertPermission(actor, "users.read");
  const { userId } = memberIdSchema.parse(input);
  const user = await findMemberInScope(actor, userId);
  return {
    member: toTeamMember(actor, user),
    access: effectiveAccess(user.role, user.roleGrants, user.overrides),
    fixedAccess: FIXED_ACCESS_ROLES.includes(user.role),
  };
}

/** Loads a member the actor is allowed to manage: same clinic, not themself, and a role they may assign. */
export async function loadEditableMember(actor: AuthUser, userId: string) {
  assertPermission(actor, "users.update");
  if (userId === actor.id) throw Errors.forbidden("You cannot change your own account here.");
  const user = await findMemberInScope(actor, userId);
  if (!ASSIGNABLE_ROLES[actor.role].includes(user.role)) throw Errors.forbidden("You cannot manage this account.");
  return user;
}

/** Owners and managers can only hand out access they hold themselves. */
function assertWithinCeiling(actor: AuthUser, before: AccessMap, after: AccessMap) {
  for (const key of MODULE_KEYS) {
    const ceiling = actor.access[key];
    const levelRaised = after[key].level !== before[key].level && exceedsLevel(after[key].level, ceiling.level);
    const tabAdded = after[key].tabs.some((t) => !before[key].tabs.includes(t) && !ceiling.tabs.includes(t));
    if (levelRaised || tabAdded) throw Errors.forbidden("You cannot give access you do not have yourself.");
  }
}

/** Access requested by the client on top of the role template; unknown tabs are dropped and NONE clears tabs. */
function requestedAccess(role: Role, input: { module: string; level: AccessLevel; tabs: string[] }[]): AccessMap {
  const access = roleTemplate(role);
  for (const { module, level, tabs } of input) {
    if (!(MODULE_KEYS as string[]).includes(module)) continue;
    const key = module as ModuleKey;
    const allowed = moduleTabs(key);
    access[key] = { level, tabs: level === "NONE" ? [] : tabs.filter((t) => allowed.includes(t)) };
  }
  return access;
}

/** Saves role, job title and window access in one transaction; every change is audited. */
export async function updateMember(actor: AuthUser, input: UpdateMemberInput): Promise<void> {
  const data = updateMemberSchema.parse(input);
  const user = await loadEditableMember(actor, data.userId);
  if (!ASSIGNABLE_ROLES[actor.role].includes(data.role)) throw Errors.forbidden("You cannot assign this role.");

  const before = effectiveAccess(user.role, user.roleGrants, user.overrides);
  const after = requestedAccess(data.role, data.access);
  assertWithinCeiling(actor, before, after);

  const roleChanged = data.role !== user.role;
  const base = { resourceType: "user", resourceId: user.id, actorId: actor.id, clinicId: user.clinicId } as const;

  await prisma.$transaction(async (tx) => {
    const role = await usersRepository.findSystemRole(data.role, tx);
    if (!role) throw new Error(`System role ${data.role} is missing; re-run the seed.`);
    if (roleChanged) {
      await usersRepository.setRole(user.id, role.id, tx);
      // A new role changes what the person can reach; make them sign in again.
      await authRepository.revokeUserSessions(user.id, tx);
    }
    if (data.jobTitle !== user.jobTitle) await usersRepository.updateJobTitle(user.id, data.jobTitle, tx);
    await usersRepository.replaceOverrides(user.id, overridesFor(role.grants, after), tx);

    if (roleChanged) {
      await audit({ ...base, action: AUDIT_ACTIONS.USER_ROLE_CHANGED, before: { role: user.role }, metadata: { from: user.role, to: data.role } }, tx);
    }
    if (data.jobTitle !== user.jobTitle) await audit({ ...base, action: AUDIT_ACTIONS.USER_TITLE_CHANGED }, tx);
    // After a role change the template reset is implied; only log explicit window changes against the new template.
    const reference = roleChanged ? roleTemplate(data.role) : before;
    for (const key of MODULE_KEYS) {
      const from = reference[key];
      const to = after[key];
      const added = to.tabs.filter((t) => !from.tabs.includes(t));
      const removed = from.tabs.filter((t) => !to.tabs.includes(t));
      if (from.level === to.level && !added.length && !removed.length) continue;
      await audit({ ...base, action: AUDIT_ACTIONS.USER_ACCESS_CHANGED, metadata: { module: key, from: from.level, to: to.level, added, removed } }, tx);
    }
  });
}

async function accountAction(actor: AuthUser, input: MemberIdInput) {
  const { userId } = memberIdSchema.parse(input);
  return loadEditableMember(actor, userId);
}

/** Emails the member a single-use reset link. Returns false if the email could not be sent. */
export async function sendMemberPasswordReset(actor: AuthUser, input: MemberIdInput): Promise<boolean> {
  const user = await accountAction(actor, input);
  if (user.status !== "active") {
    throw Errors.validation({ userId: ["Only active accounts can reset their password"] }, "Only active accounts can reset their password.");
  }
  return sendPasswordResetEmail({ id: user.id, email: user.email, name: user.fullName, clinicId: user.clinicId }, actor.id);
}

export async function revokeMemberSessions(actor: AuthUser, input: MemberIdInput): Promise<void> {
  const user = await accountAction(actor, input);
  await revokeAllSessionsFor({ id: user.id, clinicId: user.clinicId }, actor.id);
}

/** Lifts the lock set after repeated wrong passwords; the failure count restarts from here. */
export async function unlockMember(actor: AuthUser, input: MemberIdInput): Promise<void> {
  const user = await accountAction(actor, input);
  if (user.status !== "suspended") return;
  await prisma.$transaction(async (tx) => {
    await usersRepository.setStatus(user.id, "active", tx);
    await audit({ action: AUDIT_ACTIONS.USER_UNLOCKED, resourceType: "user", resourceId: user.id, actorId: actor.id, clinicId: user.clinicId }, tx);
  });
}

// ─── Access log ─────────────────────────────────────────────────────────────

const LOGGED_ACTIONS: AuditAction[] = [
  AUDIT_ACTIONS.USER_INVITED,
  AUDIT_ACTIONS.USER_ACTIVATED,
  AUDIT_ACTIONS.USER_DEACTIVATED,
  AUDIT_ACTIONS.USER_ROLE_CHANGED,
  AUDIT_ACTIONS.USER_ACCESS_CHANGED,
  AUDIT_ACTIONS.USER_TITLE_CHANGED,
  AUDIT_ACTIONS.USER_LOCKED,
  AUDIT_ACTIONS.USER_UNLOCKED,
  AUDIT_ACTIONS.SESSIONS_REVOKED,
  AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
  AUDIT_ACTIONS.SIGN_IN_RULES_UPDATED,
];

type Meta = Record<string, unknown>;

const moduleLabel = (key: unknown) => MODULES.find((m) => m.key === key)?.label ?? String(key);
const tabLabel = (module: unknown, tab: string) =>
  (MODULES.find((m) => m.key === module) as { tabs?: readonly { key: string; label: string }[] } | undefined)?.tabs?.find((t) => t.key === tab)
    ?.label ?? tab;
const roleLabel = (role: unknown) => ROLE_LABELS[role as Role] ?? String(role);
const levelLabel = (level: unknown) => ACCESS_LEVEL_LABELS[level as keyof typeof ACCESS_LEVEL_LABELS] ?? String(level);

function describe(action: string, who: string, target: string, meta: Meta): Pick<AccessLogEntry, "text" | "tone"> {
  switch (action) {
    case AUDIT_ACTIONS.USER_INVITED:
      return { text: `${who} invited ${target} as ${roleLabel(meta.role)}`, tone: "change" };
    case AUDIT_ACTIONS.USER_ACTIVATED:
      return { text: `${who} reactivated ${target}’s account`, tone: "grant" };
    case AUDIT_ACTIONS.USER_DEACTIVATED:
      return { text: `${who} deactivated ${target}’s account`, tone: "revoke" };
    case AUDIT_ACTIONS.USER_ROLE_CHANGED:
      return { text: `${who} changed ${target}’s role to ${roleLabel(meta.to)} (windows and tabs reset to the template)`, tone: "change" };
    case AUDIT_ACTIONS.USER_TITLE_CHANGED:
      return { text: `${who} updated ${target}’s job title`, tone: "neutral" };
    case AUDIT_ACTIONS.USER_ACCESS_CHANGED: {
      const added = (meta.added as string[] | undefined) ?? [];
      const removed = (meta.removed as string[] | undefined) ?? [];
      if (meta.from === meta.to && added.length + removed.length === 1) {
        const tab = tabLabel(meta.module, added[0] ?? removed[0]);
        return added.length
          ? { text: `${who} gave ${target} the ${tab} tab in ${moduleLabel(meta.module)}`, tone: "grant" }
          : { text: `${who} removed ${target}’s ${tab} tab in ${moduleLabel(meta.module)}`, tone: "revoke" };
      }
      const tone = meta.to === "NONE" ? "revoke" : meta.to === "FULL" ? "grant" : "neutral";
      return { text: `${who} set ${moduleLabel(meta.module)} to ${levelLabel(meta.to)} for ${target}`, tone };
    }
    case AUDIT_ACTIONS.USER_LOCKED:
      return { text: `${target}’s account was locked after too many wrong passwords`, tone: "revoke" };
    case AUDIT_ACTIONS.USER_UNLOCKED:
      return { text: `${who} unlocked ${target}’s account`, tone: "grant" };
    case AUDIT_ACTIONS.SESSIONS_REVOKED:
      return { text: who === target ? `${who} signed out of all devices` : `${who} signed ${target} out of all devices`, tone: "neutral" };
    case AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED:
      return { text: who === target ? `${who} asked for a password reset link` : `${who} sent ${target} a password reset link`, tone: "neutral" };
    case AUDIT_ACTIONS.SIGN_IN_RULES_UPDATED:
      return { text: `${who} updated the sign-in rules`, tone: "change" };
    default:
      return { text: `${who} changed ${target}’s account`, tone: "neutral" };
  }
}

export async function getAccessLog(actor: AuthUser): Promise<AccessLogEntry[]> {
  assertPermission(actor, "audit.read");
  const rows = await usersRepository.recentAudit({ action: { in: LOGGED_ACTIONS }, clinicId: actor.clinicId }, ACCESS_LOG_SIZE);
  const ids = [...new Set(rows.flatMap((r) => [r.actorId, r.entityId]).filter((id): id is string => !!id))];
  const names = new Map((await usersRepository.names(ids)).map((u) => [u.id, u.fullName]));
  const name = (id: string | null) => (id && names.get(id)) || "Someone";

  return rows.map((row) => ({
    id: row.id.toString(),
    at: row.occurredAt,
    ...describe(row.action, name(row.actorId), name(row.entityId), (row.afterData ?? {}) as Meta),
  }));
}

