import { describe, expect, it } from "vitest";
import { createMemoryStore, createRateLimiter, rateLimitKey } from "@backend/lib/security/rate-limit";

describe("rate limiter", () => {
  const rule = { limit: 3, windowMs: 60_000 };

  it("allows up to the limit then blocks", async () => {
    const limiter = createRateLimiter(createMemoryStore());
    const now = new Date("2026-01-01T00:00:00Z");
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await limiter.check("k", rule, now));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3].remaining).toBe(0);
  });

  it("starts a new window after expiry", async () => {
    const limiter = createRateLimiter(createMemoryStore());
    const t0 = new Date("2026-01-01T00:00:00Z");
    for (let i = 0; i < 4; i++) await limiter.check("k", rule, t0);
    const later = new Date(t0.getTime() + 60_001);
    expect((await limiter.check("k", rule, later)).allowed).toBe(true);
  });

  it("enforce() throws RATE_LIMITED and reset() clears the bucket", async () => {
    const limiter = createRateLimiter(createMemoryStore());
    for (let i = 0; i < 3; i++) await limiter.enforce("k", rule);
    await expect(limiter.enforce("k", rule)).rejects.toMatchObject({ code: "RATE_LIMITED", statusCode: 429 });
    await limiter.reset("k");
    await expect(limiter.enforce("k", rule)).resolves.toBeUndefined();
  });

  it("normalises keys so case variants share a bucket", () => {
    expect(rateLimitKey("login-email", " Dana@ISMILE.test ")).toBe("login-email:dana@ismile.test");
    expect(rateLimitKey("x", "a".repeat(500)).length).toBeLessThanOrEqual(191);
  });
});
