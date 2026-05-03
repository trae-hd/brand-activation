import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    INVITE_TOKEN_HMAC_KEY: "test-invite-key-aaaaaaaaaaaaaaaaaaaaaaaaaaa",
    RESET_TOKEN_HMAC_KEY: "test-reset-key-bbbbbbbbbbbbbbbbbbbbbbbbbbb",
  },
}));

import { mintRawToken, hashToken } from "../tokens";

describe("mintRawToken", () => {
  it("returns a non-empty string", () => {
    expect(mintRawToken().length).toBeGreaterThan(0);
  });

  it("returns different values on successive calls", () => {
    expect(mintRawToken()).not.toBe(mintRawToken());
  });
});

describe("hashToken — class separation", () => {
  it("invite and reset keys produce different hashes for the same token", () => {
    const raw = mintRawToken();
    const inviteHash = hashToken(raw, "invite");
    const resetHash = hashToken(raw, "reset");
    expect(inviteHash).not.toBe(resetHash);
  });

  it("is deterministic for the same token and class", () => {
    const raw = mintRawToken();
    expect(hashToken(raw, "invite")).toBe(hashToken(raw, "invite"));
    expect(hashToken(raw, "reset")).toBe(hashToken(raw, "reset"));
  });

  it("outputs lowercase hex", () => {
    const raw = mintRawToken();
    expect(hashToken(raw, "invite")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(raw, "reset")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("an invite token hashed with the reset key does NOT equal the invite-key hash", () => {
    const raw = mintRawToken();
    const inviteHash = hashToken(raw, "invite");
    const resetHash = hashToken(raw, "reset");
    // Key-class separation: a token from one class cannot be replayed as another.
    expect(inviteHash).not.toBe(resetHash);
  });
});
