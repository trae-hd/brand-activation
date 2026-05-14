/**
 * Tests for /api/resend-confirmation-email — Phase 4 of the post-verify
 * email feature.
 *
 * Coverage targets from prompt §10:
 *  - happy: VERIFIED + within rate limits → email sent (cause=resend) → 202
 *  - PENDING + within rate limits → 202, no email sent (anti-enumeration)
 *  - non-existent email + within rate limits → 202, no email sent
 *  - past per-IP limit → 202, audit `resend_rate_limited` (scope=ip), no send
 *  - past per-(activation, emailHash) limit → 202, audit (scope=activation_email)
 *  - timing-floor: found / not-found / rate-limited within 50ms of each other
 *  - mocked Resend failure → audit `_failed` (cause=resend) with structured
 *    reason from Phase 3's classifier, 202 still returned
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    NODE_ENV: "test",
    IP_HMAC_KEY: "test-ip-key-dddddddddddddddddddddddddddddddd",
    EMAIL_HASH_HMAC_KEY: "test-email-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    EMAIL_FROM: "noreply@activation.mrq.com",
    SUPPORT_EMAIL: "hello@activation.mrq.com",
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

const mockRegistrationFindUnique = vi.fn();
const mockRegistrationUpdate = vi.fn();
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    registration: {
      findUnique: (...args: unknown[]) => mockRegistrationFindUnique(...args),
      update: (...args: unknown[]) => mockRegistrationUpdate(...args),
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

function setupRedis() {
  mockWithRedisHealth.mockImplementation((handler: () => Promise<unknown>) => handler());
}

function allowRateLimits() {
  mockFixedWindow.mockResolvedValue(true);
}

function makeRequest(body: unknown, ip = "127.0.0.1") {
  return new Request("http://localhost/api/resend-confirmation-email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

async function callPost(req: Request) {
  const { POST } = await import("../route");
  return POST(req);
}

const VALID_BODY = {
  activationId: "act-1",
  email: "punter@example.com",
  consentVersion: "consent-v1",
};

const VERIFIED_REG = {
  id: "reg-1",
  email: "punter@example.com",
  status: "VERIFIED" as const,
  entryCode: "WEM-AB12CD",
  activation: { name: "Wembley Live Test", endsAt: new Date("2026-07-31T17:00:00Z") },
};

describe("/api/resend-confirmation-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    setupRedis();
    allowRateLimits();
    mockWriteAuditLog.mockResolvedValue(undefined);
    mockRegistrationUpdate.mockResolvedValue({});
  });

  it("returns 400 for malformed body (missing activationId)", async () => {
    const res = await callPost(
      makeRequest({ email: "punter@example.com", consentVersion: "v1" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false });
  });

  it("returns 400 for malformed body (invalid email)", async () => {
    const res = await callPost(
      makeRequest({ activationId: "act-1", email: "not-an-email", consentVersion: "v1" }),
    );
    expect(res.status).toBe(400);
  });

  it("happy path: VERIFIED + within limits → email sent (cause=resend), confirmationEmailSentAt updated, 202", async () => {
    mockRegistrationFindUnique.mockResolvedValue(VERIFIED_REG);
    mockSendEntryCodeConfirmation.mockResolvedValue({ ok: true, messageId: "msg_resend_ok" });

    const res = await callPost(makeRequest(VALID_BODY));

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });

    // Email sent with the expected args.
    expect(mockSendEntryCodeConfirmation).toHaveBeenCalledTimes(1);
    const sendArgs = mockSendEntryCodeConfirmation.mock.calls[0][0];
    expect(sendArgs.to).toBe(VERIFIED_REG.email);
    expect(sendArgs.entryCode).toBe(VERIFIED_REG.entryCode);
    expect(sendArgs.activationName).toBe("Wembley Live Test");
    expect(sendArgs.supportEmail).toBe("hello@activation.mrq.com");
    expect(sendArgs.cause).toBe("resend");

    // Timestamp updated.
    expect(mockRegistrationUpdate).toHaveBeenCalledWith({
      where: { id: VERIFIED_REG.id },
      data: { confirmationEmailSentAt: expect.any(Date) },
    });

    // Audit row: _sent with cause='resend'.
    const sent = mockWriteAuditLog.mock.calls.find(
      (c) => (c[0] as { action: string }).action === "participant.confirmation_email_sent",
    )?.[0] as {
      metadata: { resendMessageId: string; cause: string };
      targetType: string;
      targetId: string;
      category: string;
    };
    expect(sent.targetType).toBe("Registration");
    expect(sent.targetId).toBe(VERIFIED_REG.id);
    expect(sent.metadata.resendMessageId).toBe("msg_resend_ok");
    expect(sent.metadata.cause).toBe("resend");
    expect(sent.category).toBe("ADMIN");
  });

  it("PENDING row → 202, NO email sent, NO _sent / _failed audit row (anti-enumeration)", async () => {
    mockRegistrationFindUnique.mockResolvedValue({ ...VERIFIED_REG, status: "PENDING" });

    const res = await callPost(makeRequest(VALID_BODY));

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockSendEntryCodeConfirmation).not.toHaveBeenCalled();

    const actions = mockWriteAuditLog.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).not.toContain("participant.confirmation_email_sent");
    expect(actions).not.toContain("participant.confirmation_email_failed");
    expect(actions).not.toContain("participant.resend_rate_limited");
  });

  it("VERIFIED row with null entryCode → 202, NO email sent (no code to convey)", async () => {
    mockRegistrationFindUnique.mockResolvedValue({ ...VERIFIED_REG, entryCode: null });

    const res = await callPost(makeRequest(VALID_BODY));

    expect(res.status).toBe(202);
    expect(mockSendEntryCodeConfirmation).not.toHaveBeenCalled();
  });

  it("non-existent email → 202, NO email sent, NO _sent / _failed audit row", async () => {
    mockRegistrationFindUnique.mockResolvedValue(null);

    const res = await callPost(makeRequest(VALID_BODY));

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockSendEntryCodeConfirmation).not.toHaveBeenCalled();

    const actions = mockWriteAuditLog.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).not.toContain("participant.confirmation_email_sent");
    expect(actions).not.toContain("participant.confirmation_email_failed");
  });

  it("past per-IP limit (10/5min) → 202, audit resend_rate_limited (scope=ip), NO email sent, NO DB lookup", async () => {
    mockFixedWindow.mockResolvedValueOnce(false); // IP limit hit

    const res = await callPost(makeRequest(VALID_BODY));

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });

    // Per-IP denial short-circuits before the per-email rate limit and the
    // DB lookup — fixedWindow called exactly once.
    expect(mockFixedWindow).toHaveBeenCalledTimes(1);
    expect(mockRegistrationFindUnique).not.toHaveBeenCalled();
    expect(mockSendEntryCodeConfirmation).not.toHaveBeenCalled();

    const rate = mockWriteAuditLog.mock.calls.find(
      (c) => (c[0] as { action: string }).action === "participant.resend_rate_limited",
    )?.[0] as {
      metadata: { scope: string; emailHash: string };
      targetType: string;
      targetId: string;
      category: string;
    };
    expect(rate.metadata.scope).toBe("ip");
    expect(rate.targetType).toBe("Activation");
    expect(rate.targetId).toBe("act-1");
    expect(rate.category).toBe("SECURITY");
    expect(typeof rate.metadata.emailHash).toBe("string");
  });

  it("past per-(activation, emailHash) limit (3/hour) → 202, audit resend_rate_limited (scope=activation_email), NO email sent", async () => {
    mockFixedWindow
      .mockResolvedValueOnce(true) // IP allowed
      .mockResolvedValueOnce(false); // per-email denied

    const res = await callPost(makeRequest(VALID_BODY));

    expect(res.status).toBe(202);
    expect(mockRegistrationFindUnique).not.toHaveBeenCalled();
    expect(mockSendEntryCodeConfirmation).not.toHaveBeenCalled();

    const rate = mockWriteAuditLog.mock.calls.find(
      (c) => (c[0] as { action: string }).action === "participant.resend_rate_limited",
    )?.[0] as { metadata: { scope: string } };
    expect(rate.metadata.scope).toBe("activation_email");
  });

  it("Resend 5xx (transient) → audit _failed (cause=resend) with classifier reason, 202 still returned", async () => {
    mockRegistrationFindUnique.mockResolvedValue(VERIFIED_REG);
    mockSendEntryCodeConfirmation.mockResolvedValue({
      ok: false,
      reason: "transient",
      attempts: 2,
      lastError: "internal_server_error: boom",
    });

    const res = await callPost(makeRequest(VALID_BODY));

    expect(res.status).toBe(202);

    // Failure path doesn't update the timestamp.
    expect(mockRegistrationUpdate).not.toHaveBeenCalled();

    const failed = mockWriteAuditLog.mock.calls.find(
      (c) => (c[0] as { action: string }).action === "participant.confirmation_email_failed",
    )?.[0] as {
      metadata: { reason: string; attempts: number; lastError: string; cause: string };
    };
    expect(failed.metadata.reason).toBe("transient");
    expect(failed.metadata.attempts).toBe(2);
    expect(failed.metadata.cause).toBe("resend");
    expect(failed.metadata.lastError).toBe("internal_server_error: boom");
  });

  it("Resend 4xx (rejected) → audit _failed with reason='rejected', attempts=1 (no retry), 202 still returned", async () => {
    mockRegistrationFindUnique.mockResolvedValue(VERIFIED_REG);
    mockSendEntryCodeConfirmation.mockResolvedValue({
      ok: false,
      reason: "rejected",
      attempts: 1,
      lastError: "validation_error: from must be a verified domain",
    });

    const res = await callPost(makeRequest(VALID_BODY));

    expect(res.status).toBe(202);

    const failed = mockWriteAuditLog.mock.calls.find(
      (c) => (c[0] as { action: string }).action === "participant.confirmation_email_failed",
    )?.[0] as { metadata: { reason: string; attempts: number; cause: string } };
    expect(failed.metadata.reason).toBe("rejected");
    expect(failed.metadata.attempts).toBe(1);
    expect(failed.metadata.cause).toBe("resend");
  });

  it("response timing: found, not-found, and rate-limited paths within 50ms of each other (timing-floor)", async () => {
    // Real timers — the floor is enforced via setTimeout(150). Mocked deps
    // resolve effectively instantly so wall-clock difference between paths
    // converges on the floor.
    vi.useRealTimers();

    async function timed(setup: () => void): Promise<number> {
      vi.clearAllMocks();
      setupRedis();
      mockWriteAuditLog.mockResolvedValue(undefined);
      mockRegistrationUpdate.mockResolvedValue({});
      setup();
      const start = performance.now();
      await callPost(makeRequest(VALID_BODY));
      return performance.now() - start;
    }

    // Found-VERIFIED path (full work: rate limits + lookup + send + 2 updates).
    const tFound = await timed(() => {
      allowRateLimits();
      mockRegistrationFindUnique.mockResolvedValue(VERIFIED_REG);
      mockSendEntryCodeConfirmation.mockResolvedValue({
        ok: true,
        messageId: "msg_timing_found",
      });
    });

    // Not-found path (rate limits + lookup → null → return).
    const tNotFound = await timed(() => {
      allowRateLimits();
      mockRegistrationFindUnique.mockResolvedValue(null);
    });

    // Rate-limited path (per-IP denied → audit → return; no lookup, no send).
    const tRateLimited = await timed(() => {
      mockFixedWindow.mockResolvedValueOnce(false);
    });

    const max = Math.max(tFound, tNotFound, tRateLimited);
    const min = Math.min(tFound, tNotFound, tRateLimited);

    // Every path should sit at or just above the floor.
    expect(min).toBeGreaterThanOrEqual(140); // ~150ms floor minus jitter slack
    // The prompt's anti-enumeration tolerance.
    expect(max - min).toBeLessThan(50);
  });
});
