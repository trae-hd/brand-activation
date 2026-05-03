import { Redis } from "ioredis";
import { env } from "@/lib/env";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

// Strict bounds per §1: maxRetriesPerRequest: 2, commandTimeout: 1000,
// enableOfflineQueue: false — so withRedisHealth (Phase 3) can actually fail fast.
export const redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    commandTimeout: 1_000,
    enableOfflineQueue: false,
    lazyConnect: false,
  });

if (env.NODE_ENV !== "production") globalForRedis.redis = redis;
