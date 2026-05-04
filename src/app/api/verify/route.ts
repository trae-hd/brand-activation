import { NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { withRedisHealth } from "@/lib/redis/health";
import { fixedWindow } from "@/lib/rateLimit/fixedWindow";
import { hmac } from "@/lib/crypto/hmac";
import { verifyPendingToken } from "@/lib/otp/pendingToken";
import { consumeOtp, incrementAttempts } from "@/lib/otp/verify";
import { generateEntryCodeSuffix } from "@/lib/compliance/constants";

const Body = z.object({
  pendingToken: z.string().min(1),
  otp: z.string().regex(/^\d{6}$/),
});

const FAIL = NextResponse.json({ ok: false }, { status: 400 });

export async function POST(req: Request) {
  return withRedisHealth(async () => {
    const body = await req.json().catch(() => null);
    const parsed = Body.safeParse(body);
    if (!parsed.success) return FAIL;
    const { pendingToken, otp } = parsed.data;

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
    const ipHash = hmac.ip(ip);

    const ipOk = await fixedWindow({ key: `rl:ip:verify:${ipHash}`, limit: 60, windowSeconds: 60 });
    if (!ipOk) return FAIL;
    const tokenOk = await fixedWindow({
      key: `rl:tok:verify:${pendingToken}`,
      limit: 6,
      windowSeconds: 60 * 10,
    });
    if (!tokenOk) return FAIL;

    const decoded = verifyPendingToken(pendingToken);
    if (!decoded || decoded.kind === "noop") return FAIL;

    const stored = await consumeOtp(decoded.registrationId, { peek: true });
    if (!stored) return FAIL;

    if (stored.attempts >= 5) {
      await consumeOtp(decoded.registrationId, { peek: false });
      return FAIL;
    }

    const submittedHash = hmac.otp(otp);
    const a = Buffer.from(submittedHash, "hex");
    const b = Buffer.from(stored.otpHash, "hex");
    if (a.length !== b.length) {
      await incrementAttempts(decoded.registrationId);
      return FAIL;
    }
    if (!timingSafeEqual(a, b)) {
      await incrementAttempts(decoded.registrationId);
      return FAIL;
    }

    await consumeOtp(decoded.registrationId, { peek: false });

    // Fetch activation prefix to determine if an entry code should be generated.
    const reg = await prisma.registration.findUnique({
      where: { id: decoded.registrationId },
      select: { activationId: true },
    });
    const activation = reg
      ? await prisma.activation.findUnique({
          where: { id: reg.activationId },
          select: { entryCodePrefix: true },
        })
      : null;

    let entryCode: string | null = null;

    if (activation?.entryCodePrefix) {
      const prefix = activation.entryCodePrefix;
      for (let attempt = 0; attempt < 3; attempt++) {
        const candidate = `${prefix}-${generateEntryCodeSuffix()}`;
        try {
          await prisma.registration.update({
            where: { id: decoded.registrationId },
            data: { status: "VERIFIED", verifiedAt: new Date(), entryCode: candidate },
          });
          entryCode = candidate;
          break;
        } catch {
          if (attempt === 2) {
            // Give up on code generation — still mark verified without a code.
            await prisma.registration.update({
              where: { id: decoded.registrationId },
              data: { status: "VERIFIED", verifiedAt: new Date() },
            });
          }
        }
      }
    } else {
      await prisma.registration.update({
        where: { id: decoded.registrationId },
        data: { status: "VERIFIED", verifiedAt: new Date() },
      });
    }

    return NextResponse.json({ ok: true, ...(entryCode ? { entryCode } : {}) });
  });
}
