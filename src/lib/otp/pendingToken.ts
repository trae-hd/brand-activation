import { createHmac } from "crypto";
import { env } from "@/lib/env";

type Payload =
  | { kind: "issued"; registrationId: string }
  | { kind: "noop" };

export function signPendingToken(payload: Payload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", env.PENDING_TOKEN_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyPendingToken(token: string): Payload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", env.PENDING_TOKEN_SECRET).update(body).digest("base64url");
  if (expected !== sig) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
  } catch {
    return null;
  }
}
