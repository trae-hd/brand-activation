import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    EMAIL_HASH_HMAC_KEY: "test-email-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    IP_HMAC_KEY: "test-ip-key-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    OTP_HMAC_KEY: "test-otp-key-ccccccccccccccccccccccccccccccc",
  },
}));

import { hmac } from "../hmac";

describe("hmac.email", () => {
  it("is deterministic", () => {
    expect(hmac.email("alice@example.com")).toBe(hmac.email("alice@example.com"));
  });

  it("is case-insensitive — load-bearing dedup invariant", () => {
    expect(hmac.email("Foo@Bar.com")).toBe(hmac.email("FOO@BAR.COM"));
    expect(hmac.email("foo@bar.com")).toBe(hmac.email("FOO@BAR.COM"));
  });

  it("outputs lowercase hex", () => {
    expect(hmac.email("test@example.com")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hmac key separation", () => {
  it("email, ip, and otp produce different output for the same input", () => {
    const input = "same-input";
    const emailHash = hmac.email(input);
    const ipHash = hmac.ip(input);
    const otpHash = hmac.otp(input);

    expect(emailHash).not.toBe(ipHash);
    expect(emailHash).not.toBe(otpHash);
    expect(ipHash).not.toBe(otpHash);
  });
});

describe("hmac.ip", () => {
  it("is deterministic", () => {
    expect(hmac.ip("1.2.3.4")).toBe(hmac.ip("1.2.3.4"));
  });

  it("outputs lowercase hex", () => {
    expect(hmac.ip("1.2.3.4")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hmac.otp", () => {
  it("is deterministic", () => {
    expect(hmac.otp("123456")).toBe(hmac.otp("123456"));
  });

  it("outputs lowercase hex", () => {
    expect(hmac.otp("123456")).toMatch(/^[0-9a-f]{64}$/);
  });
});
