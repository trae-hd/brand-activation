/**
 * Unit tests for /api/verify — shape parity (§8.7).
 *
 * All failure paths return identical 400 { ok: false } to prevent
 * enumeration of token/OTP state.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

vi.mock("@/lib/env", () => ({
  env: {
    NODE_ENV: "test",
    OTP_HMAC_KEY: "test-otp-key-ccccccccccccccccccccccccccccccc",
    IP_HMAC_KEY: "test-ip-key-dddddddddddddddddddddddddddddddd",
    EMAIL_HASH_HMAC_KEY: "test-email-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    PENDING_TOKEN_SECRET: "test-pending-secret-eeeeeeeeeeeeeeeeeeeeeeeeee",
    EMAIL_FROM: "noreply@mrqlive.co.uk",
    SUPPORT_EMAIL: "hello@mrqlive.com",
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
const mockRegistrationFindUnique = vi.fn();
const mockActivationFindUnique = vi.fn();
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    registration: {
      update: (...args: unknown[]) => mockRegistrationUpdate(...args),
      findUnique: (...args: unknown[]) => mockRegistrationFindUnique(...args),
    },
    activation: {
      findUnique: (...args: unknown[]) => mockActivationFindUnique(...args),
    },
  },
}));

const mockSendEntryCodeConfirmation = vi.fn();
vi.mock("@/lib/email/provider", () => ({
  emailProvider: {
    sendEntryCodeConfirmation: (...args: unknown[]) =>
      mockSendEntryCodeConfirmation(...args),
  },
}));

const mockWriteAuditLog = vi.fn();
vi.mock("@/lib/audit/writeAuditLog", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
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
    mockWriteAuditLog.mockResolvedValue(undefined);
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

// ──────────────────────────────────────────────────────────────────────
// Phase 2: post-verify confirmation email + audit-row coverage.
// ──────────────────────────────────────────────────────────────────────

const OTP = "123456";
const STORED_OTP_HASH = createHmac(
  "sha256",
  "test-otp-key-ccccccccccccccccccccccccccccccc",
)
  .update(OTP)
  .digest("hex");

function setupHappyPathVerifyMocks(opts: {
  confirmationEmailSentAt?: Date | null;
  entryCodePrefix?: string | null;
} = {}) {
  const confirmationEmailSentAt = opts.confirmationEmailSentAt ?? null;
  const entryCodePrefix = opts.entryCodePrefix === undefined ? "WEM" : opts.entryCodePrefix;

  mockVerifyPendingToken.mockReturnValue({ kind: "issued", registrationId: "reg-1" });
  mockConsumeOtp.mockImplementation(async (_id: string, args: { peek: boolean }) => {
    if (args.peek) return { otpHash: STORED_OTP_HASH, attempts: 0 };
    return null; // burn
  });
  mockRegistrationFindUnique.mockResolvedValue({
    activationId: "act-1",
    email: "punter@example.com",
    confirmationEmailSentAt,
  });
  mockActivationFindUnique.mockResolvedValue({
    entryCodePrefix,
    name: "Wembley Live Test",
    endsAt: new Date("2026-07-31T17:00:00Z"),
  });
}

describe("/api/verify — post-verify audit + email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    setupRedis();
    allowRateLimits();
    mockIncrementAttempts.mockResolvedValue(undefined);
    mockRegistrationUpdate.mockResolvedValue({});
    mockWriteAuditLog.mockResolvedValue(undefined);
  });

  it("happy path: writes participant.verified, sends email, sets confirmationEmailSentAt, writes _sent audit", async () => {
    setupHappyPathVerifyMocks();
    mockSendEntryCodeConfirmation.mockResolvedValue({ ok: true, messageId: "msg_phase2_ok" });

    const res = await callPost(makeRequest({ pendingToken: "t.s", otp: OTP }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(typeof json.entryCode).toBe("string");
    expect(json.entryCode.startsWith("WEM-")).toBe(true);

    // Email sent with the right args
    expect(mockSendEntryCodeConfirmation).toHaveBeenCalledTimes(1);
    const sendArgs = mockSendEntryCodeConfirmation.mock.calls[0][0];
    expect(sendArgs.to).toBe("punter@example.com");
    expect(sendArgs.activationName).toBe("Wembley Live Test");
    expect(sendArgs.supportEmail).toBe("hello@mrqlive.com");
    expect(sendArgs.activationEndsAt).toEqual(new Date("2026-07-31T17:00:00Z"));
    expect(typeof sendArgs.entryCode).toBe("string");

    // confirmationEmailSentAt update happened (second update call)
    const sentAtUpdates = mockRegistrationUpdate.mock.calls.filter(
      (c) => "confirmationEmailSentAt" in (c[0] as { data: object }).data,
    );
    expect(sentAtUpdates).toHaveLength(1);

    // Audit rows: participant.verified + participant.confirmation_email_sent
    const actions = mockWriteAuditLog.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).toContain("participant.verified");
    expect(actions).toContain("participant.confirmation_email_sent");
    expect(actions).not.toContain("participant.confirmation_email_failed");

    const sentRow = mockWriteAuditLog.mock.calls.find(
      (c) => (c[0] as { action: string }).action === "participant.confirmation_email_sent",
    )?.[0] as { metadata: { resendMessageId: string; cause: string }; targetType: string };
    expect(sentRow.metadata.resendMessageId).toBe("msg_phase2_ok");
    expect(sentRow.metadata.cause).toBe("verify");
    expect(sentRow.targetType).toBe("Registration");
  });

  it("email failure path: writes _failed audit row but response stays 200", async () => {
    setupHappyPathVerifyMocks();
    mockSendEntryCodeConfirmation.mockResolvedValue({ ok: false, reason: "send-failed" });

    const res = await callPost(makeRequest({ pendingToken: "t.s", otp: OTP }));

    expect(res.status).toBe(200);

    // No timestamp update should have run on the failure path.
    const sentAtUpdates = mockRegistrationUpdate.mock.calls.filter(
      (c) => "confirmationEmailSentAt" in (c[0] as { data: object }).data,
    );
    expect(sentAtUpdates).toHaveLength(0);

    const actions = mockWriteAuditLog.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).toContain("participant.verified");
    expect(actions).toContain("participant.confirmation_email_failed");
    expect(actions).not.toContain("participant.confirmation_email_sent");

    const failedRow = mockWriteAuditLog.mock.calls.find(
      (c) => (c[0] as { action: string }).action === "participant.confirmation_email_failed",
    )?.[0] as { metadata: { reason: string; cause: string; attempts: number } };
    expect(failedRow.metadata.reason).toBe("transient");
    expect(failedRow.metadata.cause).toBe("verify");
    expect(failedRow.metadata.attempts).toBe(2);
  });

  it("idempotent re-verify: confirmationEmailSentAt non-null suppresses a second send and a second _sent audit row", async () => {
    setupHappyPathVerifyMocks({ confirmationEmailSentAt: new Date("2026-07-31T16:00:00Z") });
    mockSendEntryCodeConfirmation.mockResolvedValue({ ok: true, messageId: "should-not-be-called" });

    const res = await callPost(makeRequest({ pendingToken: "t.s", otp: OTP }));

    expect(res.status).toBe(200);
    expect(mockSendEntryCodeConfirmation).not.toHaveBeenCalled();

    // No timestamp update on the no-send path.
    const sentAtUpdates = mockRegistrationUpdate.mock.calls.filter(
      (c) => "confirmationEmailSentAt" in (c[0] as { data: object }).data,
    );
    expect(sentAtUpdates).toHaveLength(0);

    // participant.verified is still written; neither _sent nor _failed.
    const actions = mockWriteAuditLog.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).toContain("participant.verified");
    expect(actions).not.toContain("participant.confirmation_email_sent");
    expect(actions).not.toContain("participant.confirmation_email_failed");
  });

  it("activation without entryCodePrefix: skips the confirmation email entirely (no entry code to convey)", async () => {
    setupHappyPathVerifyMocks({ entryCodePrefix: null });

    const res = await callPost(makeRequest({ pendingToken: "t.s", otp: OTP }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(mockSendEntryCodeConfirmation).not.toHaveBeenCalled();

    const actions = mockWriteAuditLog.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).toContain("participant.verified");
    expect(actions).not.toContain("participant.confirmation_email_sent");
  });
});
