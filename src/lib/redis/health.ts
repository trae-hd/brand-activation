import { NextResponse } from "next/server";
import { redis } from "./client";

const HEALTH_TIMEOUT_MS = 500;

export async function withRedisHealth<T>(handler: () => Promise<T>): Promise<T | NextResponse> {
  try {
    const ping = redis.ping();
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("redis-timeout")), HEALTH_TIMEOUT_MS)
    );
    await Promise.race([ping, timeout]);
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Retry-After": "30" } });
  }
  return handler();
}
