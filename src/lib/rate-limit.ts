import { kv } from '@vercel/kv';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
}

/**
 * KV-based rate limiter for API routes.
 * Persists across deploys and edge function instances.
 * Uses Redis SETEX for automatic expiration.
 */
export async function kvRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const redisKey = `rl:${key}`;

  try {
    const current = await kv.get<number>(redisKey);

    if (!current) {
      // First request in window
      await kv.set(redisKey, 1, { ex: windowSeconds });
      return { allowed: true, remaining: maxRequests - 1, resetIn: windowSeconds };
    }

    if (current >= maxRequests) {
      // Get TTL for reset time
      const ttl = await kv.ttl(redisKey);
      return { allowed: false, remaining: 0, resetIn: ttl > 0 ? ttl : windowSeconds };
    }

    // Increment counter
    const newCount = await kv.incr(redisKey);
    return {
      allowed: newCount <= maxRequests,
      remaining: Math.max(0, maxRequests - newCount),
      resetIn: windowSeconds,
    };
  } catch (error) {
    // If KV fails, allow the request (fail-open for reliability)
    console.error('KV rate limit error:', error);
    return { allowed: true, remaining: maxRequests, resetIn: 0 };
  }
}
