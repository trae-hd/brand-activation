import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const [dbResult, redisResult] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redis.ping(),
  ]);

  const db = dbResult.status === "fulfilled" ? "ok" : "error";
  const cache = redisResult.status === "fulfilled" ? "ok" : "error";
  const httpStatus = db === "ok" && cache === "ok" ? 200 : 503;

  return NextResponse.json({ db, cache }, { status: httpStatus });
}
