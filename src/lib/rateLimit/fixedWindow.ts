import { redis } from "@/lib/redis/client";

/**
 * Atomic fixed-window counter. Uses a Lua script so INCR + EXPIRE happen as
 * one Redis operation — never use two separate calls; on a worker crash
 * between them, the key has no TTL and the limit becomes permanent.
 *
 * Returns true if the request is within the limit, false if it exceeds it.
 */
const SCRIPT = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
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
