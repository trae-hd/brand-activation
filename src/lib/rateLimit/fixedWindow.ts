import { redis } from "@/lib/redis/client";

/**
 * Atomic fixed-window counter. Uses a Lua script so INCR + EXPIRE happen as
 * one Redis operation — never use two separate calls; on a worker crash
 * between them, the key has no TTL and the limit becomes permanent.
 *
 * Returns true if the request is within the limit, false if it exceeds it.
 *
 * EXPIRE uses the NX flag so the TTL is set only when the key has no
 * existing TTL — this preserves the fixed-window semantics (the window
 * starts on the first hit and does not slide on subsequent hits) while
 * self-healing any key that somehow exists without a TTL (e.g. a Redis
 * restart that lost expiry metadata, or a caller that mis-set the key).
 */
const SCRIPT = `
  local current = redis.call('INCR', KEYS[1])
  if redis.call('PTTL', KEYS[1]) < 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return current
`;

interface Args {
  key: string;
  limit: number;
  windowSeconds: number;
}

export async function fixedWindow({ key, limit, windowSeconds }: Args): Promise<boolean> {
  const current = (await redis.eval(SCRIPT, 1, key, String(windowSeconds))) as number;
  return current <= limit;
}
