import type { z } from "zod";
import type { signInRulesSchema } from "./settings.schema";

export type SignInRules = z.infer<typeof signInRulesSchema>;

export const DEFAULT_SIGN_IN_RULES: SignInRules = { lockAfterFailedLogins: true, idleSignOut: false };

/** Sign-in rules stored under `signIn` in `clinics.settings` (JSON), with safe defaults. */
export function signInRulesFrom(settings: unknown): SignInRules {
  const stored = (settings as { signIn?: Partial<SignInRules> } | null)?.signIn ?? {};
  return {
    lockAfterFailedLogins: typeof stored.lockAfterFailedLogins === "boolean" ? stored.lockAfterFailedLogins : DEFAULT_SIGN_IN_RULES.lockAfterFailedLogins,
    idleSignOut: typeof stored.idleSignOut === "boolean" ? stored.idleSignOut : DEFAULT_SIGN_IN_RULES.idleSignOut,
  };
}
