import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../types.js';
import type { RedisClient } from './redis.js';

// Spike protection for public endpoints (architecture.md's Performance
// Architecture: "Rate limiting (Redis fixed window) on /api/search and the
// result endpoint"). A fixed window is simple and cheap (one INCR per
// request) and sufficient for this project's threat model — blocking
// scripted floods, not enforcing precise per-user quotas.
//
// 60 requests / 60 s (~1 req/s sustained) was chosen to sit comfortably
// above legitimate interactive use — the autocomplete's 300 ms debounce
// tops out well under this even for fast typing or a paste — while still
// capping an automated flood at a small, bounded multiple of normal load.
export const RATE_LIMIT_WINDOW_SECONDS = 60;
export const RATE_LIMIT_MAX_REQUESTS = 60;

function rateLimitKey(routeClass: string, clientId: string, windowStart: number): string {
  return `ratelimit:${routeClass}:${clientId}:${String(windowStart)}`;
}

// Cloudflare (architecture.md's Edge layer) sets CF-Connecting-IP to the
// real client IP on every request that reaches the origin through it.
// X-Forwarded-For is a sane fallback for local/staging access that bypasses
// Cloudflare. A shared 'unknown' bucket is the last resort so a request
// carrying neither header is still rate-limited (pooled with other such
// requests) rather than silently bypassing the limiter.
export function getClientId(headers: Headers): string {
  const cfConnectingIp = headers.get('CF-Connecting-IP');
  if (cfConnectingIp) return cfConnectingIp;

  const forwardedFor = headers.get('X-Forwarded-For');
  const firstForwarded = forwardedFor?.split(',')[0]?.trim();
  if (firstForwarded) return firstForwarded;

  return 'unknown';
}

// One middleware instance per route class (`routeClass`) so exceeding the
// search limit never consumes the result-page budget, and vice versa.
export function createRateLimiter(redis: RedisClient, routeClass: string) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const clientId = getClientId(c.req.raw.headers);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const windowStart = nowSeconds - (nowSeconds % RATE_LIMIT_WINDOW_SECONDS);
    const resetAt = windowStart + RATE_LIMIT_WINDOW_SECONDS;
    const key = rateLimitKey(routeClass, clientId, windowStart);

    const count = await redis.incr(key);
    if (count === 1) {
      // Only the request that created the counter needs to set its expiry.
      await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }

    c.header('X-RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS));
    c.header('X-RateLimit-Remaining', String(Math.max(0, RATE_LIMIT_MAX_REQUESTS - count)));
    c.header('X-RateLimit-Reset', String(resetAt));

    if (count > RATE_LIMIT_MAX_REQUESTS) {
      c.header('Retry-After', String(resetAt - nowSeconds));
      throw new HTTPException(429, {
        message: 'Too many requests. Please wait before trying again.',
        cause: { code: 'RATE_LIMITED' },
      });
    }

    await next();
  });
}
