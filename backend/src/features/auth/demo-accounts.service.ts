import "server-only";
import { DEMO_ACCOUNT, DEMO_STAFF } from "./demo-credentials";

export interface DemoAccount {
  label: string;
  email: string;
}

/**
 * Demo sign-in shortcut for the login page. Development only: returns null in
 * any other environment so the demo password is never sent to a real browser.
 */
export function getDemoAccounts(): { password: string; accounts: DemoAccount[] } | null {
  if (process.env.NODE_ENV !== "development") return null;
  const accounts = [DEMO_ACCOUNT, ...DEMO_STAFF].map(({ label, email }) => ({ label, email }));
  return { password: DEMO_ACCOUNT.password, accounts };
}
