import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { redirect } from "next/navigation";
import { effectiveAccess, grantKey, permissionsFor, type AccessMap } from "@backend/config/access";
import { ASSIGNED_RECORDS_ONLY_ROLES, isRole, type Permission, type Role } from "@backend/config/permissions";
import { signInRulesFrom } from "@backend/features/settings/settings.types";
import { authRepository } from "@backend/features/auth/auth.repository";
import { auth } from "./auth";
import { Errors, isAppError } from "@backend/lib/errors/app-error";
import { logSecurityEvent } from "@backend/lib/logging/logger";
import { hashToken } from "@backend/lib/security/password";

/**
 * Server-side authorization. Every helper re-validates against the database
 * (once per request, via React `cache`): the session must still be open in
 * `security_sessions` and the account active, so revocation, deactivation and
 * access changes take effect immediately even though the cookie is a JWT.
 *
 * Use in Server Components, Server Actions, Route Handlers and services.
 * Never trust clinic IDs, roles or permissions sent by the client.
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  clinicId: string;
  permissions: Permission[];
  /** Effective window access (role grants + allow/deny overrides). */
  access: AccessMap;
  /** Clinic sign-in rule: sign out after inactivity. */
  idleSignOut: boolean;
  /** The `security_sessions` row behind this request. */
  sessionId: string;
}

// ─── Session → user ──────────────────────────────────────────────────────────

function secretMatches(secret: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(secret), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The current user, or null if not signed in / session no longer valid. */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const session = await auth();
  if (!session?.sessionId || !session.sessionSecret) return null;

  const row = await authRepository.findSession(session.sessionId);
  if (!row) return null;

  const { user } = row;
  const role = user.userRoles[0]?.role.code;
  const reason =
    row.revokedAt ? "revoked"
    : row.expiresAt <= new Date() ? "expired"
    : !secretMatches(session.sessionSecret, row.refreshTokenHash) ? "secret_mismatch"
    : user.status !== "active" ? `account_${user.status}`
    : !role || !isRole(role) ? "no_role"
    : null;
  if (reason || !role || !isRole(role)) {
    logSecurityEvent("session_rejected", { userId: user.id, reason });
    return null;
  }

  const roleGrants = user.userRoles[0].role.rolePermissions.map((rp) => grantKey(rp.permission.resource, rp.permission.action));
  const overrides = user.userPermissionOverrides.map((o) => ({
    grant: grantKey(o.permission.resource, o.permission.action),
    decision: o.decision === "deny" ? ("deny" as const) : ("allow" as const),
  }));
  const access = effectiveAccess(role, roleGrants, overrides);
  return {
    id: user.id,
    email: user.email,
    name: user.fullName,
    role,
    clinicId: user.clinicId,
    permissions: permissionsFor(access),
    access,
    idleSignOut: signInRulesFrom(user.clinic.settings).idleSignOut,
    sessionId: session.sessionId,
  };
});

// ─── Pure checks (unit-tested; no I/O) ───────────────────────────────────────

export function can(user: Pick<AuthUser, "permissions">, permission: Permission): boolean {
  return user.permissions.includes(permission);
}

export function assertPermission(user: AuthUser, permission: Permission): void {
  if (!can(user, permission)) {
    logSecurityEvent("permission_denied", { userId: user.id, permission });
    throw Errors.forbidden();
  }
}

export function assertRole(user: AuthUser, roles: Role | readonly Role[]): void {
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!allowed.includes(user.role)) {
    logSecurityEvent("role_denied", { userId: user.id, role: user.role });
    throw Errors.forbidden();
  }
}

export function assertClinicAccess(user: AuthUser, clinicId: string | null | undefined): void {
  if (!clinicId || user.clinicId !== clinicId) {
    logSecurityEvent("cross_clinic_denied", { userId: user.id });
    throw Errors.forbidden();
  }
}

/** Which records a user may see. `undefined` means "not restricted on this axis". */
export interface RecordScope {
  clinicId: string;
  /** Only records assigned to this user (e.g. a dentist's own patients). */
  assigneeId?: string;
}

/**
 * Data-visibility rules: the user's clinic, then (for dentists) only records
 * assigned to them. Repositories translate this into their Prisma `where`
 * clause, and every query on clinic-owned data must apply it.
 */
export function recordScope(user: AuthUser): RecordScope {
  return {
    clinicId: user.clinicId,
    assigneeId: ASSIGNED_RECORDS_ONLY_ROLES.includes(user.role) ? user.id : undefined,
  };
}

// ─── Request helpers (throw AppError) ────────────────────────────────────────

export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw Errors.unauthenticated();
  return user;
}

export async function requireRole(roles: Role | readonly Role[]): Promise<AuthUser> {
  const user = await requireAuth();
  assertRole(user, roles);
  return user;
}

export async function requirePermission(...permissions: Permission[]): Promise<AuthUser> {
  const user = await requireAuth();
  for (const permission of permissions) assertPermission(user, permission);
  return user;
}

export async function requireClinicAccess(clinicId: string): Promise<AuthUser> {
  const user = await requireAuth();
  assertClinicAccess(user, clinicId);
  return user;
}

// ─── Pages (Server Components) ───────────────────────────────────────────────

/**
 * For pages and layouts: returns the user, or redirects to sign-in. An
 * invalid/revoked session is routed through /api/session/expired, which
 * clears the stale cookie (Server Components cannot modify cookies).
 */
export async function requirePageUser(): Promise<AuthUser> {
  try {
    return await requireAuth();
  } catch (error) {
    if (isAppError(error) && error.code === "UNAUTHENTICATED") redirect("/api/session/expired");
    throw error;
  }
}

/** Page-level permission check: returns false instead of throwing, so the page can render <AccessDenied />. */
export async function pageCan(permission: Permission): Promise<{ user: AuthUser; allowed: boolean }> {
  const user = await requirePageUser();
  return { user, allowed: can(user, permission) };
}
