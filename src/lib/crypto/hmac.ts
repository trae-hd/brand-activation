import { createHmac } from "crypto";
import { env } from "@/lib/env";

/**
 * Build a keyed HMAC-SHA256 helper. Output is lowercase hex.
 *
 * Rules:
 * - No per-row salt. Salting destroys the (activationId, emailHash) dedup
 *   invariant (§5.1) and breaks the right-to-erasure-by-hash flow (§14.3).
 * - Three independent keys (§14.4). Do not collapse into one with domain
 *   separation strings — rotation postures differ per key.
 * - Hex output, not base64url. The Postgres erasure SQL in §14.3 computes
 *   `encode(digest($1, 'sha256'), 'hex')` and compares against the column
 *   directly; encoding drift here silently misses erasure rows.
 */
const make = (key: string) => (input: string) =>
  createHmac("sha256", key).update(input).digest("hex");

export const hmac = {
  /** Email is lowercased before hashing — case-insensitive dedup invariant. */
  email: (raw: string) => make(env.EMAIL_HASH_HMAC_KEY)(raw.toLowerCase()),
  ip: make(env.IP_HMAC_KEY),
  otp: make(env.OTP_HMAC_KEY),
} as const;
