/**
 * Provider-level tests for sendEntryCodeConfirmation.
 *
 * Phase 1 established the call/retry/double-fail surface; Phase 3 adds error
 * classification (rejected vs transient) so the audit row's metadata.reason
 * carries actionable info. Failure shape is now
 * { ok: false; reason: 'rejected' | 'transient'; attempts: 1 | 2; lastError }.
 *
 * Mocked Resend errors must include a `name` from RESEND_ERROR_CODES_BY_KEY —
 * the provider's classifier dispatches on the name. An unnamed error in a
 * test would silently behave as `rejected` and skip the retry.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    NODE_ENV: "test",
    RESEND_API_KEY: "test-resend-key",
    EMAIL_FROM: "noreply@mrqlive.co.uk",
  },
}));

const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: (...args: unknown[]) => sendMock(...args) },
  })),
}));

const ARGS = {
  to: "punter@example.com",
  entryCode: "MRQ-AB12CD",
  activationName: "Wembley Live Test",
  activationEndsAt: new Date("2026-07-31T17:00:00Z"),
  supportEmail: "hello@mrqlive.com",
};

async function loadProvider() {
  const mod = await import("../resend");
  return mod.resendProvider;
}

describe("resendProvider.sendEntryCodeConfirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("calls Resend with the rendered subject, HTML, and plaintext, and returns the message id", async () => {
    sendMock.mockResolvedValueOnce({ data: { id: "msg_abc123" }, error: null });

    const provider = await loadProvider();
    const result = await provider.sendEntryCodeConfirmation(ARGS);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.from).toBe("noreply@mrqlive.co.uk");
    expect(call.to).toBe(ARGS.to);
    expect(call.subject).toBe("Your entry code for Wembley Live Test");
    expect(call.html).toContain(ARGS.entryCode);
    expect(call.text).toContain(ARGS.entryCode);
    // No Reply-To header — one-way send.
    expect(call).not.toHaveProperty("reply_to");
    expect(call).not.toHaveProperty("replyTo");

    expect(result).toEqual({ ok: true, messageId: "msg_abc123" });
  });

  it("retries once on a transient 5xx and succeeds on the second attempt (attempts: 2)", async () => {
    sendMock
      .mockResolvedValueOnce({
        data: null,
        error: { name: "internal_server_error", message: "boom" },
      })
      .mockResolvedValueOnce({ data: { id: "msg_retry_ok" }, error: null });

    const provider = await loadProvider();
    const result = await provider.sendEntryCodeConfirmation(ARGS);

    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true, messageId: "msg_retry_ok" });
  });

  it("returns { ok: false, reason: 'transient', attempts: 2 } after two 5xx attempts", async () => {
    sendMock
      .mockResolvedValueOnce({
        data: null,
        error: { name: "internal_server_error", message: "first failure" },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { name: "application_error", message: "second failure" },
      });

    const provider = await loadProvider();
    const result = await provider.sendEntryCodeConfirmation(ARGS);

    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("transient");
    expect(result.attempts).toBe(2);
    expect(result.lastError).toContain("application_error");
    expect(result.lastError).toContain("second failure");
    expect(result.lastError.length).toBeLessThanOrEqual(200);
  });

  it("does not retry on a 4xx (validation_error) — returns reason: 'rejected', attempts: 1", async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { name: "validation_error", message: "from must be a verified domain" },
    });

    const provider = await loadProvider();
    const result = await provider.sendEntryCodeConfirmation(ARGS);

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("rejected");
    expect(result.attempts).toBe(1);
    expect(result.lastError).toContain("validation_error");
  });

  it("does not retry on a 4xx (missing_required_field) — returns reason: 'rejected', attempts: 1", async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { name: "missing_required_field", message: "to is required" },
    });

    const provider = await loadProvider();
    const result = await provider.sendEntryCodeConfirmation(ARGS);

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("rejected");
    expect(result.attempts).toBe(1);
  });

  it("classifies thrown network errors (ECONNRESET) as transient and retries once", async () => {
    sendMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    sendMock.mockRejectedValueOnce(new Error("ECONNRESET"));

    const provider = await loadProvider();
    const result = await provider.sendEntryCodeConfirmation(ARGS);

    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("transient");
    expect(result.attempts).toBe(2);
    expect(result.lastError).toContain("ECONNRESET");
  });

  it("truncates lastError to ≤200 chars and never echoes the recipient address", async () => {
    const longBlast = "X".repeat(500);
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { name: "validation_error", message: longBlast },
    });

    const provider = await loadProvider();
    const result = await provider.sendEntryCodeConfirmation(ARGS);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.lastError.length).toBeLessThanOrEqual(200);
    // Provider must not include the recipient email — that would put PII in
    // the audit log.
    expect(result.lastError).not.toContain(ARGS.to);
  });

  it("succeeds on retry after a 5xx — surfaces the second-attempt messageId", async () => {
    sendMock
      .mockResolvedValueOnce({
        data: null,
        error: { name: "application_error", message: "transient" },
      })
      .mockResolvedValueOnce({ data: { id: "msg_after_retry" }, error: null });

    const provider = await loadProvider();
    const result = await provider.sendEntryCodeConfirmation(ARGS);

    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true, messageId: "msg_after_retry" });
  });
});

// ──────────────────────────────────────────────────────────────────────
// Failure-shape parity: every EmailProvider method runs through the same
// sendWithRetry helper, so classification (rejected vs transient, attempts,
// lastError) must surface uniformly. These tests exercise sendOtp,
// sendInvite, and sendPasswordReset to prove the shape isn't only carried
// by sendEntryCodeConfirmation.
// ──────────────────────────────────────────────────────────────────────

describe("resendProvider — structured failure shape across all methods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("sendOtp surfaces { reason: 'rejected', attempts: 1 } on a 4xx", async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { name: "validation_error", message: "from must be a verified domain" },
    });

    const provider = await loadProvider();
    const result = await provider.sendOtp({ to: "punter@example.com", otp: "123456" });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("rejected");
    expect(result.attempts).toBe(1);
    expect(result.lastError).toContain("validation_error");
  });

  it("sendInvite surfaces { reason: 'transient', attempts: 2 } on two 5xx attempts", async () => {
    sendMock
      .mockResolvedValueOnce({
        data: null,
        error: { name: "internal_server_error", message: "boom" },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { name: "application_error", message: "still boom" },
      });

    const provider = await loadProvider();
    const result = await provider.sendInvite({
      to: "newadmin@mrq.com",
      name: "Casey Admin",
      setPasswordUrl: "https://admin.mrqlive.co.uk/auth/set-password?type=invite&token=abc",
      issuerName: "Trae",
      workspaceName: "MrQ Live",
      role: "ADMIN",
    });

    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("transient");
    expect(result.attempts).toBe(2);
    expect(result.lastError).toContain("application_error");
  });

  it("sendPasswordReset surfaces { reason: 'rejected', attempts: 1 } on a 429 (rate_limit_exceeded)", async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { name: "rate_limit_exceeded", message: "Too many requests" },
    });

    const provider = await loadProvider();
    const result = await provider.sendPasswordReset({
      to: "trae@mrq.com",
      setPasswordUrl: "https://admin.mrqlive.co.uk/auth/set-password?type=reset&token=xyz",
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    // 429s are 4xx-class for our purposes — retrying immediately would just
    // re-hit the limit. Default branch correctly classifies as 'rejected'.
    expect(result.reason).toBe("rejected");
    expect(result.attempts).toBe(1);
    expect(result.lastError).toContain("rate_limit_exceeded");
  });

  it("sendOtp success surface carries messageId: { ok: true, messageId }", async () => {
    sendMock.mockResolvedValueOnce({ data: { id: "msg_otp_ok" }, error: null });

    const provider = await loadProvider();
    const result = await provider.sendOtp({ to: "punter@example.com", otp: "654321" });

    expect(result).toEqual({ ok: true, messageId: "msg_otp_ok" });
  });

  it("sendInvite success surface carries messageId: { ok: true, messageId }", async () => {
    sendMock.mockResolvedValueOnce({ data: { id: "msg_invite_ok" }, error: null });

    const provider = await loadProvider();
    const result = await provider.sendInvite({
      to: "newadmin@mrq.com",
      name: "Casey Admin",
      setPasswordUrl: "https://admin.mrqlive.co.uk/auth/set-password?type=invite&token=abc",
      issuerName: "Trae",
      workspaceName: "MrQ Live",
      role: "MEMBER",
    });

    expect(result).toEqual({ ok: true, messageId: "msg_invite_ok" });
  });

  it("sendPasswordReset success surface carries messageId: { ok: true, messageId }", async () => {
    sendMock.mockResolvedValueOnce({ data: { id: "msg_reset_ok" }, error: null });

    const provider = await loadProvider();
    const result = await provider.sendPasswordReset({
      to: "trae@mrq.com",
      setPasswordUrl: "https://admin.mrqlive.co.uk/auth/set-password?type=reset&token=xyz",
    });

    expect(result).toEqual({ ok: true, messageId: "msg_reset_ok" });
  });

  it("sendEntryCodeConfirmation success surface carries messageId (parity check with the other three)", async () => {
    sendMock.mockResolvedValueOnce({ data: { id: "msg_entry_ok" }, error: null });

    const provider = await loadProvider();
    const result = await provider.sendEntryCodeConfirmation(ARGS);

    expect(result).toEqual({ ok: true, messageId: "msg_entry_ok" });
  });
});
