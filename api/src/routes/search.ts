import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../types.js';
import { examSearchQuerySchema } from '../schemas/examSearch.js';
import { searchByExamNo, getPublishedYears } from '../services/examSearch.js';
import { db } from '../db/client.js';
import { redis } from '../lib/redis.js';

const search = new Hono<AppEnv>();

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
    const { no, year } = c.req.valid('query');
    const result = await searchByExamNo(db, redis, no, year);
    if (result === null) {
      throw new HTTPException(404, {
        message: 'No result found for this exam number and year.',
        cause: { code: 'STUDENT_NOT_FOUND' },
      });
    }
    return c.json({ data: result }, 200);
  },
);

search.get('/years', async (c) => {
  const years = await getPublishedYears(db, redis);
  return c.json({ data: { years } }, 200);
});

export default search;
