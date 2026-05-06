import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";

function hourBucket(): number {
  return Math.floor(Date.now() / (1000 * 3600));
}

function computeHmac(activationId: string, hour: number): string {
  return createHmac("sha256", env.NEXTAUTH_SECRET)
    .update(`preview:${activationId}:${hour}`)
    .digest("base64url");
}

/** Returns an opaque token valid for ~1–2 hours for the given activationId. */
export function signPreviewToken(activationId: string): string {
  const hour = hourBucket();
  return `${hour}.${computeHmac(activationId, hour)}`;
}

/** Returns true if the token was signed for activationId and has not expired. */
export function verifyPreviewToken(activationId: string, token: string): boolean {
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const hour = parseInt(token.slice(0, dot), 10);
  if (isNaN(hour)) return false;
  const current = hourBucket();
  // Accept the current hour and the immediately previous one (1–2 h window).
  if (hour !== current && hour !== current - 1) return false;
  const expected = computeHmac(activationId, hour);
  const provided = token.slice(dot + 1);
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}
