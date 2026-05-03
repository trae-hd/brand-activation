import { randomBytes, createHmac } from "crypto";
import { env } from "@/lib/env";

export type TokenClass = "invite" | "reset";

export function mintRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(raw: string, kind: TokenClass): string {
  const key = kind === "invite" ? env.INVITE_TOKEN_HMAC_KEY : env.RESET_TOKEN_HMAC_KEY;
  return createHmac("sha256", key).update(raw).digest("hex");
}
