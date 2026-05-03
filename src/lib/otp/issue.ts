import { randomInt } from "crypto";
import { redis } from "@/lib/redis/client";
import { hmac } from "@/lib/crypto/hmac";

const OTP_TTL_SECONDS = 600; // 10 minutes

export async function issueOtp(registrationId: string): Promise<{ otp: string; otpHash: string }> {
  const otp = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const otpHash = hmac.otp(otp);
  // Store hash + attempt counter as a hash. One active OTP per registration: SET overwrites.
  await redis
    .multi()
    .del(`otp:${registrationId}`)
    .hset(`otp:${registrationId}`, { otpHash, attempts: "0" })
    .expire(`otp:${registrationId}`, OTP_TTL_SECONDS)
    .exec();
  return { otp, otpHash };
}
