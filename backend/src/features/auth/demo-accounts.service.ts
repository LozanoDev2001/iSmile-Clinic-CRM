import "server-only";

export interface DemoAccount {
  label: string;
  email: string;
}

/** Accounts created by prisma/seed.ts. Keep in sync with the seed. */
const SEEDED_ACCOUNTS: DemoAccount[] = [
  { label: "Super admin", email: "superadmin@ismile.test" },
  { label: "Clinic admin", email: "admin@ismile.test" },
  { label: "Front desk", email: "reception@ismile.test" },
  { label: "Dentist", email: "dentist@ismile.test" },
  { label: "Accounts", email: "finance@ismile.test" },
  { label: "CRM", email: "crm@ismile.test" },
];

/**
 * Demo sign-in shortcuts for the login page. Development only: returns null in
 * any other environment so the seed password is never sent to a real browser.
 */
export function getDemoAccounts(): { password: string; accounts: DemoAccount[] } | null {
  if (process.env.NODE_ENV !== "development") return null;
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12) return null;
  return { password, accounts: SEEDED_ACCOUNTS };
}
