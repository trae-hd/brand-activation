import { redis } from "@/lib/redis/client";

interface StoredOtp {
  otpHash: string;
  attempts: number;
}

export async function consumeOtp(
  registrationId: string,
  opts: { peek: boolean }
): Promise<StoredOtp | null> {
  const key = `otp:${registrationId}`;
  if (opts.peek) {
    const data = await redis.hgetall(key);
    if (!data || !data.otpHash) return null;
    return { otpHash: data.otpHash, attempts: Number(data.attempts ?? 0) };
  }
  await redis.del(key);
  return null;
}

export async function incrementAttempts(registrationId: string): Promise<void> {
  await redis.hincrby(`otp:${registrationId}`, "attempts", 1);
}
