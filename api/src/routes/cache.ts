import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../types.js';
import { requireSession } from '../middleware/requireSession.js';
import { redis } from '../lib/redis.js';
import {
  getCacheStatus,
  listCacheKeys,
  inspectCacheKey,
  invalidateCacheKey,
  flushResultCache,
  CacheKeyOutOfScopeError,
} from '../services/cacheAdmin.js';
import { listCacheKeysQuerySchema, cacheKeyParamSchema, flushCacheBodySchema } from '../schemas/cache.js';
import { validationErrorHook } from '../lib/validation.js';

const cache = new Hono<AppEnv>();

cache.use('*', requireSession);

cache.get('/status', async (c) => {
  const result = await getCacheStatus(redis);
  c.header('Cache-Control', 'no-store');
  return c.json({ data: result }, 200);
});

cache.get(
  '/keys',
  zValidator('query', listCacheKeysQuerySchema, validationErrorHook('Invalid query parameters')),
  async (c) => {
    const query = c.req.valid('query');

    let result;
    try {
      result = await listCacheKeys(redis, query);
    } catch (err) {
      if (err instanceof CacheKeyOutOfScopeError) {
        throw new HTTPException(400, { message: err.message, cause: { code: 'CACHE_KEY_OUT_OF_SCOPE' } });
      }
      throw err;
    }

    c.header('Cache-Control', 'no-store');
    return c.json({ data: result }, 200);
  },
);

cache.get(
  '/keys/:key',
  zValidator('param', cacheKeyParamSchema, validationErrorHook('Invalid cache key')),
  async (c) => {
    const { key } = c.req.valid('param');

    let result;
    try {
      result = await inspectCacheKey(redis, key);
    } catch (err) {
      if (err instanceof CacheKeyOutOfScopeError) {
        throw new HTTPException(400, { message: err.message, cause: { code: 'CACHE_KEY_OUT_OF_SCOPE' } });
      }
      throw err;
    }

    if (result === null) {
      throw new HTTPException(404, {
        message: 'This cache key does not exist (it may have already expired).',
        cause: { code: 'CACHE_KEY_NOT_FOUND' },
      });
    }
    c.header('Cache-Control', 'no-store');
    return c.json({ data: result }, 200);
  },
);

cache.delete(
  '/keys/:key',
  zValidator('param', cacheKeyParamSchema, validationErrorHook('Invalid cache key')),
  async (c) => {
    const { key } = c.req.valid('param');

    let result;
    try {
      result = await invalidateCacheKey(redis, key);
    } catch (err) {
      if (err instanceof CacheKeyOutOfScopeError) {
        throw new HTTPException(400, { message: err.message, cause: { code: 'CACHE_KEY_OUT_OF_SCOPE' } });
      }
      throw err;
    }

    c.header('Cache-Control', 'no-store');
    return c.json({ data: result }, 200);
  },
);

cache.post(
  '/flush',
  zValidator('json', flushCacheBodySchema, validationErrorHook('Invalid request body')),
  async (c) => {
    const { pattern } = c.req.valid('json');

    let result;
    try {
      result = await flushResultCache(redis, pattern);
    } catch (err) {
      if (err instanceof CacheKeyOutOfScopeError) {
        throw new HTTPException(400, { message: err.message, cause: { code: 'CACHE_KEY_OUT_OF_SCOPE' } });
      }
      throw err;
    }

    c.header('Cache-Control', 'no-store');
    return c.json({ data: result }, 200);
  },
);

export default cache;
