import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types.js';

// architecture.md's Performance Architecture: public GET responses carry
// Cache-Control so Cloudflare edge-caches them (short TTL on search, longer
// on result pages — both purged wholesale on publish/unpublish, see
// publish.ts), while admin/auth responses must never be cached anywhere.
export const SEARCH_CACHE_MAX_AGE_SECONDS = 60;
export const RESULT_PAGE_CACHE_MAX_AGE_SECONDS = 300;

// Only applied to a successful response so error bodies (400, 404, 429, ...)
// are never cached at the edge. Checked by status rather than relying on
// `next()` throwing, since a Zod validation failure returns its response
// directly rather than throwing.
export function publicCache(maxAgeSeconds: number) {
  return createMiddleware<AppEnv>(async (c, next) => {
    await next();
    if (c.res.status < 300) {
      c.header('Cache-Control', `public, max-age=${String(maxAgeSeconds)}`);
    }
  });
}

export const noStoreCache = createMiddleware<AppEnv>(async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
});
