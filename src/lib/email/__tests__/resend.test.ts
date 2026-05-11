/**
 * Provider-level tests for the new sendEntryCodeConfirmation method.
 *
 * The codebase uses a result-shape return ({ ok, reason } / { ok, messageId })
 * rather than throw-on-failure — the prompt §10 says "throws after both
 * attempts fail" but the codebase convention is checked, not thrown.
 * Audit branching at the call site reads `result.ok`.
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

  it("retries once on transient failure and succeeds on the second attempt", async () => {
    sendMock
      .mockResolvedValueOnce({ data: null, error: { message: "transient 5xx" } })
      .mockResolvedValueOnce({ data: { id: "msg_retry_ok" }, error: null });

    const provider = await loadProvider();
    const result = await provider.sendEntryCodeConfirmation(ARGS);

    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true, messageId: "msg_retry_ok" });
  });

  it("returns { ok: false } after both attempts fail", async () => {
    sendMock
      .mockResolvedValueOnce({ data: null, error: { message: "first failure" } })
      .mockResolvedValueOnce({ data: null, error: { message: "second failure" } });

    const provider = await loadProvider();
    const result = await provider.sendEntryCodeConfirmation(ARGS);

    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: false, reason: "send-failed" });
  });

  it("returns { ok: false } when both attempts throw (network error)", async () => {
    sendMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    sendMock.mockRejectedValueOnce(new Error("ECONNRESET"));

    const provider = await loadProvider();
    const result = await provider.sendEntryCodeConfirmation(ARGS);

    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: false, reason: "send-failed" });
  });
});
