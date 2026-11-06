import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { SECURITY } from "@backend/config/security";

// @node-rs/argon2 defaults to Argon2id; parameters are set explicitly.
const ARGON2_OPTIONS = { ...SECURITY.argon2 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/**
 * Hash of a random value, verified when the account does not exist so that
 * "unknown email" and "wrong password" take the same time (no user
 * enumeration through response timing).
 */
let dummyHash: Promise<string> | undefined;

export async function verifyPassword(passwordHash: string | null | undefined, password: string): Promise<boolean> {
  if (!passwordHash) {
    dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
    await verify(await dummyHash, password).catch(() => false);
    return false;
  }
  try {
    return await verify(passwordHash, password);
  } catch {
    return false; // malformed hash
  }
}

/** URL-safe random token (256 bits) and the SHA-256 hash that is stored. */
export function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
