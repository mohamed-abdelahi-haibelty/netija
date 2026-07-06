import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../types.js';
import { getStudentPage, getAdminResultPreview } from '../services/studentPage.js';
import { db } from '../db/client.js';
import { redis } from '../lib/redis.js';
import { requireSession } from '../middleware/requireSession.js';
import { createRateLimiter } from '../lib/rateLimit.js';
import {
  publicCache,
  noStoreCache,
  RESULT_PAGE_CACHE_MAX_AGE_SECONDS,
} from '../middleware/cacheControl.js';

// The public result page is addressed by its random `slug`. Internally the
// result is still one attempt keyed by (exam_year, exam_no).
const paramsSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, 'slug must contain only URL-safe characters'),
});

const results = new Hono<AppEnv>();

results.get(
  '/:slug',
  createRateLimiter(redis, 'results'),
  publicCache(RESULT_PAGE_CACHE_MAX_AGE_SECONDS),
  zValidator('param', paramsSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid result identifier',
            issues: result.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        },
        400,
      );
    }
  }),
  async (c) => {
    const { slug } = c.req.valid('param');
    const result = await getStudentPage(db, redis, slug);
    if (result === null) {
      throw new HTTPException(404, {
        message: 'Result not found.',
        cause: { code: 'STUDENT_NOT_FOUND' },
      });
    }
    return c.json({ data: result }, 200);
  },
);

// Auth-gated admin preview: the same lookup, but visible regardless of the
// import's published flag (architecture.md's admin-preview invariant) and
// never cached, since it's used to inspect unpublished data and by the
// results-day smoke check.
results.get(
  '/:slug/admin',
  requireSession,
  noStoreCache,
  zValidator('param', paramsSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid result identifier',
            issues: result.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        },
        400,
      );
    }
  }),
  async (c) => {
    const { slug } = c.req.valid('param');
    const result = await getAdminResultPreview(db, slug);
    if (result === null) {
      throw new HTTPException(404, {
        message: 'Result not found.',
        cause: { code: 'STUDENT_NOT_FOUND' },
      });
    }
    return c.json({ data: result }, 200);
  },
);

export default results;
