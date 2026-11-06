import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies an HMAC-SHA256 webhook signature (hex, optionally prefixed
 * "sha256=") over the RAW request body, with a timestamp window against
 * replay. Use for SMS/email/payment provider callbacks when integrations are
 * enabled; prefer the provider's official SDK verifier when one exists.
 *
 *   const raw = await request.text();
 *   if (!verifyHmacSignature({ payload: raw, signature, secret, timestamp })) throw Errors.forbidden();
 */
export function verifyHmacSignature({
  payload,
  signature,
  secret,
  timestamp,
  toleranceSeconds = 300,
  now = Date.now(),
}: {
  payload: string;
  signature: string | null | undefined;
  secret: string;
  /** Unix seconds sent by the provider; included in the signed content when present. */
  timestamp?: string | null;
  toleranceSeconds?: number;
  now?: number;
}): boolean {
  if (!signature || !secret) return false;
  if (timestamp !== undefined) {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > toleranceSeconds) return false;
  }
  const signed = timestamp ? `${timestamp}.${payload}` : payload;
  const expected = createHmac("sha256", secret).update(signed).digest();
  const provided = Buffer.from(signature.replace(/^sha256=/, ""), "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
