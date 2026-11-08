import { z } from 'zod';
import { paginationSchema } from './common.js';

export const DEFAULT_CACHE_KEYS_PAGE_SIZE = 20;
export const MAX_CACHE_KEYS_PAGE_SIZE = 100;

export const listCacheKeysQuerySchema = z.object({
  pattern: z.string().trim().min(1).optional(),
  ...paginationSchema({
    defaultPageSize: DEFAULT_CACHE_KEYS_PAGE_SIZE,
    maxPageSize: MAX_CACHE_KEYS_PAGE_SIZE,
  }),
});

export type ListCacheKeysQuery = z.infer<typeof listCacheKeysQuerySchema>;

export const cacheKeyParamSchema = z.object({
  key: z.string().trim().min(1, 'key is required'),
});

export type CacheKeyParam = z.infer<typeof cacheKeyParamSchema>;

// pattern is optional: an empty body flushes the whole result cache.
export const flushCacheBodySchema = z.object({
  pattern: z.string().trim().min(1).optional(),
});

export type FlushCacheBody = z.infer<typeof flushCacheBodySchema>;
