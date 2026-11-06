/**
 * Central RBAC definition. Add a permission here, grant it to roles below,
 * and check it with `requirePermission()` on the server or `can()` for UI.
 * Never hard-code role names in pages or services.
 *
 * Note: a permission only says WHAT a role may do. WHICH records it may touch
 * is decided by clinic / branch / record scoping in src/lib/authorization.ts.
 */
import type { Role } from "@backend/generated/prisma/enums";

export const PERMISSIONS = [
  "patients.read",
  "patients.create",
  "patients.update",
  "patients.medical.read",
  "patients.medical.update",

  "appointments.read",
  "appointments.create",
  "appointments.update",
  "appointments.cancel",

  "treatments.read",
  "treatments.update",

  "leads.read",
  "leads.create",
  "leads.update",

  "billing.read",
  "billing.create",
  "billing.update",

  "reports.read",

  "users.read",
  "users.create",
  "users.update",

  "settings.read",
  "settings.update",

  "audit.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = [
  "SUPER_ADMIN",
  "CLINIC_ADMIN",
  "DENTIST",
  "RECEPTIONIST",
  "FINANCE_STAFF",
  "CRM_STAFF",
] as const satisfies readonly Role[];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  CLINIC_ADMIN: "Clinic Admin",
  DENTIST: "Dentist",
  RECEPTIONIST: "Receptionist",
  FINANCE_STAFF: "Finance Staff",
  CRM_STAFF: "CRM Staff",
};

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: PERMISSIONS,

  CLINIC_ADMIN: [
    "patients.read",
    "patients.create",
    "patients.update",
    "appointments.read",
    "appointments.create",
    "appointments.update",
    "appointments.cancel",
    "treatments.read",
    "leads.read",
    "billing.read",
    "reports.read",
    "users.read",
    "users.create",
    "users.update",
    "settings.read",
    "settings.update",
    "audit.read",
  ],

  DENTIST: [
    "patients.read",
    "patients.update",
    "patients.medical.read",
    "patients.medical.update",
    "appointments.read",
    "appointments.update",
    "treatments.read",
    "treatments.update",
  ],

  RECEPTIONIST: [
    "patients.read",
    "patients.create",
    "patients.update",
    "appointments.read",
    "appointments.create",
    "appointments.update",
    "appointments.cancel",
  ],

  FINANCE_STAFF: ["patients.read", "billing.read", "billing.create", "billing.update", "reports.read"],

  CRM_STAFF: ["leads.read", "leads.create", "leads.update"],
};

/**
 * Roles that see every branch of their clinic. Other roles only see the
 * branches assigned to them in `user_branches`.
 */
export const CLINIC_WIDE_ROLES: readonly Role[] = ["SUPER_ADMIN", "CLINIC_ADMIN"];

/** Roles limited to records explicitly assigned to them (record-level access). */
export const ASSIGNED_RECORDS_ONLY_ROLES: readonly Role[] = ["DENTIST"];

/** Roles each role may assign when creating or editing users. */
export const ASSIGNABLE_ROLES: Record<Role, readonly Role[]> = {
  SUPER_ADMIN: ROLES,
  CLINIC_ADMIN: ["CLINIC_ADMIN", "DENTIST", "RECEPTIONIST", "FINANCE_STAFF", "CRM_STAFF"],
  DENTIST: [],
  RECEPTIONIST: [],
  FINANCE_STAFF: [],
  CRM_STAFF: [],
};

const permissionSets = Object.fromEntries(
  Object.entries(ROLE_PERMISSIONS).map(([role, perms]) => [role, new Set<Permission>(perms)]),
) as Record<Role, Set<Permission>>;

export function hasPermission(role: Role, permission: Permission): boolean {
  return permissionSets[role]?.has(permission) ?? false;
}

export function getPermissions(role: Role): Permission[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
