import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    PENDING_TOKEN_SECRET: "test-pending-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },
}));

import { signPendingToken, verifyPendingToken } from "../pendingToken";

describe("signPendingToken / verifyPendingToken", () => {
  it("round-trips an issued payload", () => {
    const payload = { kind: "issued" as const, registrationId: "reg_abc123" };
    const token = signPendingToken(payload);
    expect(verifyPendingToken(token)).toEqual(payload);
  });

  it("round-trips a noop payload", () => {
    const token = signPendingToken({ kind: "noop" });
    expect(verifyPendingToken(token)).toEqual({ kind: "noop" });
  });

  it("returns null for a tampered signature", () => {
    const token = signPendingToken({ kind: "noop" });
    const tampered = token.slice(0, -4) + "xxxx";
    expect(verifyPendingToken(tampered)).toBeNull();
  });

  it("returns null for a tampered body", () => {
    const token = signPendingToken({ kind: "issued", registrationId: "reg_abc" });
    const [, sig] = token.split(".");
    const fakeBody = Buffer.from(JSON.stringify({ kind: "noop" })).toString("base64url");
    const tampered = `${fakeBody}.${sig}`;
    expect(verifyPendingToken(tampered)).toBeNull();
  });

  it("returns null for a malformed token (no dot)", () => {
    expect(verifyPendingToken("notavalidtoken")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(verifyPendingToken("")).toBeNull();
  });
});
