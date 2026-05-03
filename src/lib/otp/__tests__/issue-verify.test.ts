import { describe, it, expect, afterAll, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    OTP_HMAC_KEY: "test-otp-key-ccccccccccccccccccccccccccccccc",
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    NODE_ENV: "test",
  },
}));

import { issueOtp } from "../issue";
import { consumeOtp, incrementAttempts } from "../verify";
import { redis } from "@/lib/redis/client";

afterAll(async () => {
  await redis.quit();
});

describe("issueOtp / consumeOtp round trip", () => {
  it("stores hash and returns it on peek", async () => {
    const regId = `test-reg-${Date.now()}`;
    const { otp, otpHash } = await issueOtp(regId);

    expect(otp).toMatch(/^\d{6}$/);
    expect(otpHash).toMatch(/^[0-9a-f]{64}$/);

    const stored = await consumeOtp(regId, { peek: true });
    expect(stored).not.toBeNull();
    expect(stored!.otpHash).toBe(otpHash);
    expect(stored!.attempts).toBe(0);

    await redis.del(`otp:${regId}`);
  });

  it("deletes the key on consume (peek: false)", async () => {
    const regId = `test-reg-${Date.now()}-b`;
    await issueOtp(regId);

    await consumeOtp(regId, { peek: false });
    const stored = await consumeOtp(regId, { peek: true });
    expect(stored).toBeNull();
  });

  it("overwrites a previous OTP on re-issue", async () => {
    const regId = `test-reg-${Date.now()}-c`;

    const first = await issueOtp(regId);
    const second = await issueOtp(regId);

    const stored = await consumeOtp(regId, { peek: true });
    expect(stored!.otpHash).toBe(second.otpHash);
    expect(stored!.otpHash).not.toBe(first.otpHash);

    await redis.del(`otp:${regId}`);
  });

  it("returns null when the key does not exist", async () => {
    const stored = await consumeOtp("non-existent-reg-id", { peek: true });
    expect(stored).toBeNull();
  });
});

describe("incrementAttempts", () => {
  it("increments the attempt counter", async () => {
    const regId = `test-reg-${Date.now()}-d`;
    await issueOtp(regId);

    await incrementAttempts(regId);
    await incrementAttempts(regId);

    const stored = await consumeOtp(regId, { peek: true });
    expect(stored!.attempts).toBe(2);

    await redis.del(`otp:${regId}`);
  });
});
