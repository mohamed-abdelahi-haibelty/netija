import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../types.js';
import { requireSession } from '../middleware/requireSession.js';
import { db } from '../db/client.js';
import { meili } from '../lib/meili.js';
import {
  getSearchIndexStatus,
  listSearchIndexDocuments,
  reindexSearchIndex,
} from '../services/searchIndexAdmin.js';
import { listSearchIndexDocumentsQuerySchema } from '../schemas/searchIndex.js';

const searchIndex = new Hono<AppEnv>();

searchIndex.use('*', requireSession);

searchIndex.get('/status', async (c) => {
  const result = await getSearchIndexStatus(meili);
  c.header('Cache-Control', 'no-store');
  return c.json({ data: result }, 200);
});

searchIndex.get(
  '/documents',
  zValidator('query', listSearchIndexDocumentsQuerySchema, (result, c) => {
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
    const query = c.req.valid('query');
    const result = await listSearchIndexDocuments(db, meili, query);
    if (result === null) {
      throw new HTTPException(404, {
        message: 'Import not found.',
        cause: { code: 'IMPORT_NOT_FOUND' },
      });
    }
    c.header('Cache-Control', 'no-store');
    return c.json({ data: result }, 200);
  },
);

searchIndex.post('/reindex', async (c) => {
  const result = await reindexSearchIndex(db, meili);
  return c.json({ data: result }, 200);
});

export default searchIndex;
