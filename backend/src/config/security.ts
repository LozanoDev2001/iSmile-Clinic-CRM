/** Central security tunables. Change values here, not at call sites. */
export const SECURITY = {
  password: {
    minLength: 12,
    maxLength: 128,
  },

  /** Argon2id parameters (OWASP recommended baseline: m=19 MiB, t=2, p=1). */
  argon2: {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  },

  session: {
    /** Re-issue the session cookie at most this often while the user is active. */
    updateAgeSeconds: 30 * 60,
  },

  passwordReset: {
    tokenTtlMinutes: 30,
  },

  invite: {
    tokenTtlHours: 72,
  },

  /** Clinic sign-in rules (Settings → Team & roles). */
  accountLock: {
    maxFailedLogins: 5,
  },
  idleSignOut: {
    minutes: 30,
  },

  rateLimits: {
    loginPerIp: { limit: 20, windowMs: 15 * 60_000 },
    loginPerEmail: { limit: 5, windowMs: 15 * 60_000 },
    passwordResetPerIp: { limit: 5, windowMs: 60 * 60_000 },
    passwordResetPerEmail: { limit: 3, windowMs: 60 * 60_000 },
    passwordChangePerUser: { limit: 5, windowMs: 15 * 60_000 },
  },
} as const;

/** Paths reachable without a session. Everything else requires login. */
export const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"] as const;
export const PUBLIC_API_PREFIXES = ["/api/auth", "/api/health", "/api/session"] as const;

export const DEFAULT_LOGIN_REDIRECT = "/dashboard";
export const LOGIN_PATH = "/login";

/** Only allow same-site relative redirects (prevents open-redirects). */
export function safeCallbackUrl(value: unknown, fallback: string = DEFAULT_LOGIN_REDIRECT): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  if (PUBLIC_PATHS.some((p) => value === p || value.startsWith(`${p}?`))) return fallback;
  return value;
}
