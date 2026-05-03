/**
 * Unit tests for /api/verify — shape parity (§8.7).
 *
 * All failure paths return identical 400 { ok: false } to prevent
 * enumeration of token/OTP state.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    NODE_ENV: "test",
    OTP_HMAC_KEY: "test-otp-key-ccccccccccccccccccccccccccccccc",
    IP_HMAC_KEY: "test-ip-key-dddddddddddddddddddddddddddddddd",
    PENDING_TOKEN_SECRET: "test-pending-secret-eeeeeeeeeeeeeeeeeeeeeeeeee",
  },
}));

const mockWithRedisHealth = vi.fn();
vi.mock("@/lib/redis/health", () => ({
  withRedisHealth: (handler: () => Promise<unknown>) => mockWithRedisHealth(handler),
}));

const mockFixedWindow = vi.fn();
vi.mock("@/lib/rateLimit/fixedWindow", () => ({
  fixedWindow: (...args: unknown[]) => mockFixedWindow(...args),
}));

const mockVerifyPendingToken = vi.fn();
vi.mock("@/lib/otp/pendingToken", () => ({
  verifyPendingToken: (token: unknown) => mockVerifyPendingToken(token),
}));

const mockConsumeOtp = vi.fn();
const mockIncrementAttempts = vi.fn();
vi.mock("@/lib/otp/verify", () => ({
  consumeOtp: (...args: unknown[]) => mockConsumeOtp(...args),
  incrementAttempts: (...args: unknown[]) => mockIncrementAttempts(...args),
}));

const mockRegistrationUpdate = vi.fn();
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    registration: { update: (...args: unknown[]) => mockRegistrationUpdate(...args) },
  },
}));

// withRedisHealth delegates directly to the handler for these tests.
function setupRedis() {
  mockWithRedisHealth.mockImplementation((handler: () => Promise<unknown>) => handler());
}

function allowRateLimits() {
  mockFixedWindow.mockResolvedValue(true);
}

function makeRequest(body: unknown, ip = "127.0.0.1") {
  return new Request("http://localhost/api/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

async function callPost(req: Request) {
  const { POST } = await import("../route");
  return POST(req);
}

describe("/api/verify — shape parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    setupRedis();
    allowRateLimits();
    mockIncrementAttempts.mockResolvedValue(undefined);
    mockRegistrationUpdate.mockResolvedValue({});
  });

  it("returns 400 for malformed body (missing otp)", async () => {
    const res = await callPost(makeRequest({ pendingToken: "abc" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false });
  });

  it("returns 400 for malformed body (otp not 6 digits)", async () => {
    const res = await callPost(makeRequest({ pendingToken: "abc", otp: "12345" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false });
  });

  it("returns 400 when pendingToken is a noop token", async () => {
    mockVerifyPendingToken.mockReturnValue({ kind: "noop" });
    mockConsumeOtp.mockResolvedValue({ otpHash: "a".repeat(64), attempts: 0 });

    const res = await callPost(makeRequest({ pendingToken: "noop.sig", otp: "123456" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false });
  });

  it("returns 400 when pendingToken signature is invalid", async () => {
    mockVerifyPendingToken.mockReturnValue(null);

    const res = await callPost(makeRequest({ pendingToken: "bad.token", otp: "123456" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false });
  });

  it("returns 400 when OTP key is missing from Redis (expired)", async () => {
    mockVerifyPendingToken.mockReturnValue({ kind: "issued", registrationId: "reg-1" });
    mockConsumeOtp.mockResolvedValue(null);

    const res = await callPost(makeRequest({ pendingToken: "t.s", otp: "123456" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false });
  });

  it("returns 400 and burns key when attempts >= 5", async () => {
    mockVerifyPendingToken.mockReturnValue({ kind: "issued", registrationId: "reg-1" });
    mockConsumeOtp.mockResolvedValueOnce({ otpHash: "a".repeat(64), attempts: 5 });
    mockConsumeOtp.mockResolvedValueOnce(null); // peek: false burn

    const res = await callPost(makeRequest({ pendingToken: "t.s", otp: "123456" }));
    expect(res.status).toBe(400);
    // Verify the key was burned (peek: false called)
    expect(mockConsumeOtp).toHaveBeenCalledWith("reg-1", { peek: false });
  });

  it("returns 400 and increments attempts for wrong OTP", async () => {
    // Use a known OTP hash mismatch: stored hash is all-zeros, submitted is different.
    mockVerifyPendingToken.mockReturnValue({ kind: "issued", registrationId: "reg-1" });
    mockConsumeOtp.mockResolvedValue({ otpHash: "0".repeat(64), attempts: 0 });

    const res = await callPost(makeRequest({ pendingToken: "t.s", otp: "000000" }));
    // The hmac.otp("000000") will not equal "0".repeat(64), so this should fail.
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false });
    expect(mockIncrementAttempts).toHaveBeenCalledWith("reg-1");
  });

  it("returns 400 for wrong OTP — same shape as all other failures", async () => {
    mockVerifyPendingToken.mockReturnValue({ kind: "issued", registrationId: "reg-1" });
    mockConsumeOtp.mockResolvedValue({ otpHash: "f".repeat(64), attempts: 2 });

    const res = await callPost(makeRequest({ pendingToken: "t.s", otp: "999999" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false });
  });

  it("returns 400 for rate-limited IP", async () => {
    mockFixedWindow.mockResolvedValueOnce(false); // IP limit hit
    mockVerifyPendingToken.mockReturnValue({ kind: "issued", registrationId: "reg-1" });
    mockConsumeOtp.mockResolvedValue({ otpHash: "a".repeat(64), attempts: 0 });

    const res = await callPost(makeRequest({ pendingToken: "t.s", otp: "123456" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false });
  });

  it("returns 503 when Redis is unhealthy", async () => {
    mockWithRedisHealth.mockResolvedValue(
      Response.json({ ok: false }, { status: 503 })
    );

    const res = await callPost(makeRequest({ pendingToken: "t.s", otp: "123456" }));
    expect(res.status).toBe(503);
  });
});
