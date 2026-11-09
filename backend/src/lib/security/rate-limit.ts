import "server-only";
import { Errors } from "@backend/lib/errors/app-error";
import { logSecurityEvent } from "@backend/lib/logging/logger";

/**
 * Fixed-window rate limiter. Counters live in MySQL (table `rate_limits`) so
 * limits hold across server instances and restarts without adding Redis.
 * The store is swappable (e.g. in-memory for tests).
 */

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export interface RateLimitStore {
  /** Atomically increments the counter for `key` and returns the new state. */
  hit(key: string, windowMs: number, now: Date): Promise<{ count: number; resetAt: Date }>;
  reset(key: string): Promise<void>;
}

export const databaseStore: RateLimitStore = {
  async hit(key, windowMs, now) {
    const { prisma } = await import("@backend/lib/prisma");
    const newResetAt = new Date(now.getTime() + windowMs);
    // Single atomic upsert: starts a new window when the old one has expired.
    // Assignments run left-to-right, so `reset_at` in the 2nd IF is still the old value.
    await prisma.$executeRaw`
      INSERT INTO rate_limits (id, count, reset_at) VALUES (${key}, 1, ${newResetAt})
      ON DUPLICATE KEY UPDATE
        count = IF(reset_at <= ${now}, 1, count + 1),
        reset_at = IF(reset_at <= ${now}, ${newResetAt}, reset_at)`;
    const row = await prisma.rateLimit.findUnique({ where: { id: key } });

    // Opportunistic cleanup of expired windows (~1% of hits).
    if (Math.random() < 0.01) {
      void prisma.rateLimit.deleteMany({ where: { resetAt: { lt: now } } }).catch(() => undefined);
    }
    return { count: row?.count ?? 1, resetAt: row?.resetAt ?? newResetAt };
  },
  async reset(key) {
    const { prisma } = await import("@backend/lib/prisma");
    await prisma.rateLimit.deleteMany({ where: { id: key } });
  },
};

export function createMemoryStore(): RateLimitStore {
  const windows = new Map<string, { count: number; resetAt: Date }>();
  return {
    async hit(key, windowMs, now) {
      const current = windows.get(key);
      const next =
        !current || current.resetAt <= now
          ? { count: 1, resetAt: new Date(now.getTime() + windowMs) }
          : { count: current.count + 1, resetAt: current.resetAt };
      windows.set(key, next);
      return next;
    },
    async reset(key) {
      windows.delete(key);
    },
  };
}

export function createRateLimiter(store: RateLimitStore) {
  return {
    async check(key: string, rule: RateLimitRule, now = new Date()): Promise<RateLimitResult> {
      const { count, resetAt } = await store.hit(key, rule.windowMs, now);
      return { allowed: count <= rule.limit, remaining: Math.max(0, rule.limit - count), resetAt };
    },
    /** Throws RATE_LIMITED when the limit is exceeded. */
    async enforce(key: string, rule: RateLimitRule): Promise<void> {
      const result = await this.check(key, rule);
      if (!result.allowed) {
        logSecurityEvent("rate_limited", { bucket: key.split(":")[0] });
        throw Errors.rateLimited();
      }
    },
    reset: (key: string) => store.reset(key),
  };
}

export const rateLimiter = createRateLimiter(databaseStore);

/** Normalised bucket key. Emails are lower-cased so case variants share a bucket. */
export function rateLimitKey(bucket: string, identifier: string): string {
  return `${bucket}:${identifier.trim().toLowerCase()}`.slice(0, 191);
}
