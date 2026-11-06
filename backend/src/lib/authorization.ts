import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import {
  ASSIGNED_RECORDS_ONLY_ROLES,
  CLINIC_WIDE_ROLES,
  getPermissions,
  hasPermission,
  type Permission,
} from "@backend/config/permissions";
import type { Role } from "@backend/generated/prisma/enums";
import { authRepository } from "@backend/features/auth/auth.repository";
import { auth } from "./auth";
import { Errors, isAppError } from "@backend/lib/errors/app-error";
import { logSecurityEvent } from "@backend/lib/logging/logger";
import { prisma } from "./prisma";

/**
 * Server-side authorization. Every helper re-validates against the database
 * (once per request, via React `cache`), so deactivation, role changes and
 * revoked sessions take effect immediately even though sessions are JWTs.
 *
 * Use in Server Components, Server Actions, Route Handlers and services.
 * Never trust clinic IDs, roles or permissions sent by the client.
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** null only for SUPER_ADMIN. */
  clinicId: string | null;
  /** Branches explicitly assigned (ignored for clinic-wide roles). */
  branchIds: string[];
  permissions: Permission[];
}

// ─── Session → user ──────────────────────────────────────────────────────────

/** The current user, or null if not signed in / session no longer valid. */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await authRepository.findSessionUser(userId);
  if (!user) return null;

  const revoked = user.sessionVersion !== session.sessionVersion;
  const disabled = !user.isActive || (user.clinic !== null && !user.clinic.isActive);
  if (revoked || disabled) {
    logSecurityEvent("session_rejected", { userId, reason: revoked ? "revoked" : "disabled" });
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    clinicId: user.clinicId,
    branchIds: user.branches.map((b) => b.branchId),
    permissions: getPermissions(user.role),
  };
});

// ─── Pure checks (unit-tested; no I/O) ───────────────────────────────────────

export function can(user: Pick<AuthUser, "role">, permission: Permission): boolean {
  return hasPermission(user.role, permission);
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

export function isClinicWide(user: Pick<AuthUser, "role">): boolean {
  return CLINIC_WIDE_ROLES.includes(user.role);
}

export function assertClinicAccess(user: AuthUser, clinicId: string | null | undefined): void {
  if (user.role === "SUPER_ADMIN") return;
  if (!clinicId || user.clinicId !== clinicId) {
    logSecurityEvent("cross_clinic_denied", { userId: user.id });
    throw Errors.forbidden();
  }
}

export function assertBranchAccess(user: AuthUser, branch: { id: string; clinicId: string }): void {
  assertClinicAccess(user, branch.clinicId);
  if (isClinicWide(user)) return;
  if (!user.branchIds.includes(branch.id)) {
    logSecurityEvent("branch_denied", { userId: user.id });
    throw Errors.forbidden();
  }
}

/**
 * The clinic a user is operating in. Non super-admins always use their own
 * clinic; any client-supplied clinic ID is ignored for them.
 */
export function resolveClinicId(user: AuthUser, requested?: string | null): string {
  if (user.role === "SUPER_ADMIN") {
    if (!requested) throw Errors.validation({ clinicId: ["Select a clinic"] });
    return requested;
  }
  if (!user.clinicId) throw Errors.forbidden();
  return user.clinicId;
}

/** Which records a user may see. `undefined` means "not restricted on this axis". */
export interface RecordScope {
  clinicId?: string;
  branchIds?: string[];
  /** Only records assigned to this user (e.g. a dentist's own patients). */
  assigneeId?: string;
}

/**
 * Data-visibility rules: clinic → assigned branches → (for dentists) assigned
 * records. Repositories translate this into their Prisma `where` clause, and
 * every query on clinic-owned data must apply it.
 */
export function recordScope(user: AuthUser): RecordScope {
  if (user.role === "SUPER_ADMIN") return {};
  if (!user.clinicId) throw Errors.forbidden();
  return {
    clinicId: user.clinicId,
    branchIds: isClinicWide(user) ? undefined : user.branchIds,
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

export async function requireBranchAccess(branchId: string): Promise<AuthUser> {
  const user = await requireAuth();
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, clinicId: true, isActive: true },
  });
  // Same response for "missing" and "not yours" to avoid probing other clinics.
  if (!branch || !branch.isActive) throw Errors.forbidden();
  assertBranchAccess(user, branch);
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
