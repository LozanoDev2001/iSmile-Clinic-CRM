import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyHmacSignature } from "@backend/lib/security/webhook";

const secret = "whsec_test";
const sign = (content: string) => createHmac("sha256", secret).update(content).digest("hex");

describe("verifyHmacSignature", () => {
  it("accepts a valid signature and rejects tampering", () => {
    const payload = '{"event":"sms.delivered"}';
    expect(verifyHmacSignature({ payload, signature: sign(payload), secret })).toBe(true);
    expect(verifyHmacSignature({ payload, signature: `sha256=${sign(payload)}`, secret })).toBe(true);
    expect(verifyHmacSignature({ payload: payload + " ", signature: sign(payload), secret })).toBe(false);
    expect(verifyHmacSignature({ payload, signature: "deadbeef", secret })).toBe(false);
    expect(verifyHmacSignature({ payload, signature: null, secret })).toBe(false);
  });

  it("rejects replays outside the timestamp window", () => {
    const now = Date.UTC(2026, 0, 1);
    const ts = String(now / 1000);
    const payload = "{}";
    const signature = sign(`${ts}.${payload}`);
    expect(verifyHmacSignature({ payload, signature, secret, timestamp: ts, now })).toBe(true);
    expect(verifyHmacSignature({ payload, signature, secret, timestamp: ts, now: now + 10 * 60_000 })).toBe(false);
  });
});
