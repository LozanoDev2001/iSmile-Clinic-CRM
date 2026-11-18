/**
 * Central permission vocabulary and role rules. Which permissions a user holds
 * is derived from their window access (src/config/access.ts): a role template
 * plus any per-user overrides. Check with `can()` / `assertPermission()`.
 * Never hard-code role names in pages or services.
 *
 * Note: a permission only says WHAT a user may do. WHICH records they may touch
 * is decided by clinic and record scoping in src/lib/authorization.ts.
 */
export const PERMISSIONS = [
  "dashboards.frontdesk",
  "dashboards.dentist",
  "dashboards.accounts",
  "dashboards.owner",

  "crwdforce.read",
  "crwdforce.update",

  "leads.read",
  "leads.create",
  "leads.update",

  "contacts.read",
  "contacts.update",

  "patients.read",
  "patients.create",
  "patients.update",
  "patients.medical.read",
  "patients.medical.update",

  "treatments.read",
  "treatments.update",

  "messaging.read",
  "messaging.send",

  "appointments.read",
  "appointments.create",
  "appointments.update",
  "appointments.cancel",

  "billing.read",
  "billing.create",
  "billing.update",
  "billing.approve",

  "reports.read",

  "users.read",
  "users.create",
  "users.update",

  "settings.read",
  "settings.update",

  "audit.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Role codes stored in `roles.code` for the system roles (clinic_id NULL). */
export const ROLES = [
  "OWNER",
  "GENERAL_MANAGER",
  "DENTIST",
  "FRONT_DESK",
  "ACCOUNTS",
  "DENTAL_ASSISTANT",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  GENERAL_MANAGER: "General manager",
  DENTIST: "Dentist",
  FRONT_DESK: "Front desk",
  ACCOUNTS: "Accounts",
  DENTAL_ASSISTANT: "Dental assistant",
};

/** Roles limited to records explicitly assigned to them (record-level access). */
export const ASSIGNED_RECORDS_ONLY_ROLES: readonly Role[] = ["DENTIST"];

/**
 * Roles each role may assign, and therefore whose accounts it may edit.
 * Owners are created by the seed / onboarding, never from the app.
 */
export const ASSIGNABLE_ROLES: Record<Role, readonly Role[]> = {
  OWNER: ["GENERAL_MANAGER", "DENTIST", "FRONT_DESK", "ACCOUNTS", "DENTAL_ASSISTANT"],
  GENERAL_MANAGER: ["DENTIST", "FRONT_DESK", "ACCOUNTS", "DENTAL_ASSISTANT"],
  DENTIST: [],
  FRONT_DESK: [],
  ACCOUNTS: [],
  DENTAL_ASSISTANT: [],
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
