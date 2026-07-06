import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../types.js';
import { examSearchQuerySchema, examTypeQuerySchema } from '../schemas/examSearch.js';
import { nameSearchQuerySchema } from '../schemas/nameSearch.js';
import { searchByExamNo, getPublishedYears } from '../services/examSearch.js';
import { searchByName } from '../services/nameSearch.js';
import { db } from '../db/client.js';
import { redis } from '../lib/redis.js';
import { meili } from '../lib/meili.js';
import { createRateLimiter } from '../lib/rateLimit.js';
import { publicCache, SEARCH_CACHE_MAX_AGE_SECONDS } from '../middleware/cacheControl.js';

const search = new Hono<AppEnv>();

// Every route on this router is public and unauthenticated (exam/name search,
// published years) — rate limit and edge-cache all of it as one route class.
search.use('*', createRateLimiter(redis, 'search'));
search.use('*', publicCache(SEARCH_CACHE_MAX_AGE_SECONDS));

search.get(
  '/exam',
  zValidator('query', examSearchQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
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
    const { no, year, type } = c.req.valid('query');
    const result = await searchByExamNo(db, redis, type, no, year);
    if (result === null) {
      throw new HTTPException(404, {
        message: 'No result found for this exam number and year.',
        cause: { code: 'STUDENT_NOT_FOUND' },
      });
    }
    return c.json({ data: result }, 200);
  },
);

search.get(
  '/years',
  zValidator('query', examTypeQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
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
    const { type } = c.req.valid('query');
    const years = await getPublishedYears(db, redis, type);
    return c.json({ data: { years } }, 200);
  },
);

search.get(
  '/name',
  zValidator('query', nameSearchQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
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
    const { q, type } = c.req.valid('query');
    const suggestions = await searchByName(meili, q, type);
    return c.json({ data: { suggestions } }, 200);
  },
);

export default search;
