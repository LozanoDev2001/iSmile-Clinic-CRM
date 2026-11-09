import "server-only";
import { DEMO_ACCOUNT } from "./demo-credentials";

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
  return { password: DEMO_ACCOUNT.password, accounts: [{ label: DEMO_ACCOUNT.label, email: DEMO_ACCOUNT.email }] };
}
