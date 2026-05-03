import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getDevOtp } from "@/lib/email/devProvider";

export async function GET(req: Request) {
  if (env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }
  const { searchParams } = new URL(req.url);
  const to = searchParams.get("to");
  if (!to) return NextResponse.json({ ok: false }, { status: 400 });
  const otp = getDevOtp(to);
  if (!otp) return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.json({ otp });
}
