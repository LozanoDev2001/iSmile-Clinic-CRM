/**
 * Window-level access. Each role starts from a template; owners and managers
 * can then override any window for an individual employee. Server-side
 * permissions are derived from the effective levels, so the toggles in
 * Settings → Team & roles are what actually gate access.
 */
import type { Permission, Role } from "./permissions";

export const ACCESS_LEVELS = ["NONE", "VIEW", "FULL"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = { NONE: "No access", VIEW: "View", FULL: "Full" };

export const MODULE_GROUPS = ["Dashboards", "Patients and front desk", "Money", "Administration"] as const;

interface ModuleDef {
  key: string;
  label: string;
  description: string;
  group: (typeof MODULE_GROUPS)[number];
  tabs?: readonly { key: string; label: string }[];
}

export const MODULES = [
  { key: "dash_frontdesk", label: "Front desk dashboard", description: "Today’s worklist, bookings and Mia’s activity", group: "Dashboards" },
  { key: "dash_dentist", label: "Dentist dashboard", description: "The dentist’s own schedule, production and reports", group: "Dashboards" },
  { key: "dash_accounts", label: "Accounts dashboard", description: "Collections, receivables and BIR deadlines", group: "Dashboards" },
  { key: "dash_owner", label: "Owner dashboard", description: "Profit, cash position, approvals and team results", group: "Dashboards" },
  { key: "crwdforce", label: "crwdForce (Mia)", description: "Live chats and calls, and Mia’s setup", group: "Patients and front desk" },
  { key: "leads", label: "Leads", description: "New enquiries and follow-ups", group: "Patients and front desk" },
  {
    key: "contacts",
    label: "Contacts",
    description: "Patients, leads, guardians and partners",
    group: "Patients and front desk",
    tabs: [
      { key: "patients", label: "Patients" },
      { key: "leads", label: "Leads" },
      { key: "guardians", label: "Guardians" },
      { key: "partners", label: "Partners" },
    ],
  },
  {
    key: "patients",
    label: "Patients",
    description: "Patient records, history and X-rays",
    group: "Patients and front desk",
    tabs: [
      { key: "overview", label: "Overview" },
      { key: "visit_history", label: "Visit history" },
      { key: "xrays", label: "X-rays & files" },
    ],
  },
  { key: "messaging", label: "Messaging", description: "Messenger, Viber, Instagram and WhatsApp inboxes", group: "Patients and front desk" },
  { key: "calendar", label: "Calendar", description: "Clinic calendar and bookings", group: "Patients and front desk" },
  {
    key: "billing",
    label: "Billing and accounting",
    description: "Invoices, payments, HMO claims, BIR and audit",
    group: "Money",
    tabs: [
      { key: "overview", label: "Overview" },
      { key: "sales_invoices", label: "Sales invoices" },
      { key: "payment_plans", label: "Payment plans" },
      { key: "collections", label: "Collections & bank" },
    ],
  },
  { key: "reports", label: "Reports", description: "Clinic performance reports", group: "Money" },
  { key: "settings", label: "Settings", description: "Clinic profile, team, integrations and notifications", group: "Administration" },
] as const satisfies readonly ModuleDef[];

export type ModuleKey = (typeof MODULES)[number]["key"];
export const MODULE_KEYS = MODULES.map((m) => m.key) as ModuleKey[];

export interface ModuleAccess {
  level: AccessLevel;
  /** Tab keys enabled inside the window; empty for windows without tabs. */
  tabs: string[];
}
export type AccessMap = Record<ModuleKey, ModuleAccess>;

export function moduleTabs(key: ModuleKey): string[] {
  const def: ModuleDef = MODULES.find((m) => m.key === key)!;
  return def.tabs?.map((t) => t.key) ?? [];
}

type TemplateEntry = AccessLevel | { level: AccessLevel; tabs: string[] };

const ALL_FULL = Object.fromEntries(MODULE_KEYS.map((k) => [k, "FULL"])) as Record<ModuleKey, TemplateEntry>;

/** Windows not listed are NONE. A bare level enables every tab of the window. */
const ROLE_TEMPLATES: Record<Role, Partial<Record<ModuleKey, TemplateEntry>>> = {
  OWNER: ALL_FULL,
  GENERAL_MANAGER: { ...ALL_FULL, dash_owner: "VIEW" },
  DENTIST: {
    dash_dentist: "FULL",
    contacts: { level: "VIEW", tabs: ["patients", "guardians"] },
    patients: "FULL",
    messaging: "VIEW",
    calendar: "FULL",
  },
  FRONT_DESK: {
    dash_frontdesk: "FULL",
    crwdforce: "FULL",
    leads: "FULL",
    contacts: "FULL",
    patients: { level: "FULL", tabs: ["overview"] },
    messaging: "FULL",
    calendar: "FULL",
    billing: { level: "VIEW", tabs: ["overview", "sales_invoices", "payment_plans"] },
  },
  ACCOUNTS: {
    dash_accounts: "FULL",
    contacts: "VIEW",
    patients: { level: "VIEW", tabs: ["overview"] },
    calendar: "VIEW",
    billing: "FULL",
    reports: "FULL",
  },
  DENTAL_ASSISTANT: {
    dash_dentist: "VIEW",
    patients: "VIEW",
    calendar: "VIEW",
  },
};

/** Roles whose access is fixed at the template (cannot be overridden). */
export const FIXED_ACCESS_ROLES: readonly Role[] = ["OWNER"];

export function roleTemplate(role: Role): AccessMap {
  const template = ROLE_TEMPLATES[role];
  return Object.fromEntries(
    MODULE_KEYS.map((key) => {
      const entry = template[key] ?? "NONE";
      if (typeof entry !== "string") return [key, { level: entry.level, tabs: [...entry.tabs] }];
      return [key, { level: entry, tabs: entry === "NONE" ? [] : moduleTabs(key) }];
    }),
  ) as AccessMap;
}

// ─── Grants: rows of the `permissions` table ──────────────────────────────

/**
 * A grant is one `permissions` row, written "resource:action": `billing:view`,
 * `billing:full` or `billing:tab:sales_invoices`. Roles hold grants through
 * `role_permissions`; `user_permission_overrides` allow or deny single grants.
 */
export type GrantKey = string;

export const grantKey = (resource: string, action: string): GrantKey => `${resource}:${action}`;

/** Every grant that exists — the rows the seed writes to `permissions`. */
export function allGrants(): { resource: string; action: string }[] {
  return MODULE_KEYS.flatMap((m) => [
    { resource: m, action: "view" },
    { resource: m, action: "full" },
    ...moduleTabs(m).map((t) => ({ resource: m, action: `tab:${t}` })),
  ]);
}

export function grantsFromAccess(access: AccessMap): GrantKey[] {
  return MODULE_KEYS.flatMap((m) => {
    const { level, tabs } = access[m];
    if (level === "NONE") return [];
    return [grantKey(m, "view"), ...(level === "FULL" ? [grantKey(m, "full")] : []), ...tabs.map((t) => grantKey(m, `tab:${t}`))];
  });
}

export function accessFromGrants(grants: Iterable<GrantKey>): AccessMap {
  const set = new Set(grants);
  return Object.fromEntries(
    MODULE_KEYS.map((m) => {
      // "view" opens the window; "full" only adds change rights on top of it.
      const level: AccessLevel = !set.has(grantKey(m, "view")) ? "NONE" : set.has(grantKey(m, "full")) ? "FULL" : "VIEW";
      const tabs = level === "NONE" ? [] : moduleTabs(m).filter((t) => set.has(grantKey(m, `tab:${t}`)));
      return [m, { level, tabs }];
    }),
  ) as AccessMap;
}

export interface GrantOverride {
  grant: GrantKey;
  decision: "allow" | "deny";
}

/** Role grants plus the user's allow/deny overrides. Owners ignore overrides. */
export function effectiveAccess(role: Role, roleGrants: Iterable<GrantKey>, overrides: readonly GrantOverride[] = []): AccessMap {
  if (FIXED_ACCESS_ROLES.includes(role)) return roleTemplate(role);
  const set = new Set(roleGrants);
  for (const o of overrides) {
    if (o.decision === "allow") set.add(o.grant);
    else set.delete(o.grant);
  }
  return accessFromGrants(set);
}

/** Overrides needed to turn `roleGrants` into `access`. */
export function overridesFor(roleGrants: Iterable<GrantKey>, access: AccessMap): GrantOverride[] {
  const base = new Set(roleGrants);
  const wanted = new Set(grantsFromAccess(access));
  return [
    ...[...wanted].filter((g) => !base.has(g)).map((grant) => ({ grant, decision: "allow" as const })),
    ...[...base].filter((g) => !wanted.has(g)).map((grant) => ({ grant, decision: "deny" as const })),
  ];
}

/** Effective permissions for a role template (no overrides). */
export function getPermissions(role: Role): Permission[] {
  return permissionsFor(roleTemplate(role));
}

interface Grant {
  view: Permission[];
  full?: Permission[];
  /** Extra permissions unlocked by a specific tab. */
  tabs?: Record<string, { view: Permission[]; full?: Permission[] }>;
}

const MODULE_GRANTS: Record<ModuleKey, Grant> = {
  dash_frontdesk: { view: ["dashboards.frontdesk"] },
  dash_dentist: { view: ["dashboards.dentist"] },
  dash_accounts: { view: ["dashboards.accounts"] },
  dash_owner: { view: ["dashboards.owner"] },
  crwdforce: { view: ["crwdforce.read"], full: ["crwdforce.update"] },
  leads: { view: ["leads.read"], full: ["leads.create", "leads.update"] },
  contacts: { view: ["contacts.read"], full: ["contacts.update"] },
  patients: {
    view: ["patients.read"],
    full: ["patients.create", "patients.update"],
    tabs: {
      visit_history: { view: ["patients.medical.read", "treatments.read"], full: ["patients.medical.update", "treatments.update"] },
    },
  },
  messaging: { view: ["messaging.read"], full: ["messaging.send"] },
  calendar: { view: ["appointments.read"], full: ["appointments.create", "appointments.update", "appointments.cancel"] },
  billing: { view: ["billing.read"], full: ["billing.create", "billing.update"] },
  reports: { view: ["reports.read"] },
  settings: { view: ["settings.read", "users.read", "audit.read"], full: ["settings.update", "users.create", "users.update"] },
};

export function permissionsFor(access: AccessMap): Permission[] {
  const granted = new Set<Permission>();
  for (const key of MODULE_KEYS) {
    const { level, tabs } = access[key];
    if (level === "NONE") continue;
    const grant = MODULE_GRANTS[key];
    const add = (g: { view: Permission[]; full?: Permission[] }) => {
      g.view.forEach((p) => granted.add(p));
      if (level === "FULL") g.full?.forEach((p) => granted.add(p));
    };
    add(grant);
    for (const tab of tabs) if (grant.tabs?.[tab]) add(grant.tabs[tab]);
  }
  return [...granted];
}

const LEVEL_RANK: Record<AccessLevel, number> = { NONE: 0, VIEW: 1, FULL: 2 };

export function exceedsLevel(requested: AccessLevel, ceiling: AccessLevel): boolean {
  return LEVEL_RANK[requested] > LEVEL_RANK[ceiling];
}
