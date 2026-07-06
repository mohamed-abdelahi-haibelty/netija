import { z } from 'zod';

export const DEFAULT_CACHE_KEYS_PAGE_SIZE = 20;
export const MAX_CACHE_KEYS_PAGE_SIZE = 100;

export const listCacheKeysQuerySchema = z.object({
  pattern: z.string().trim().min(1).optional(),
  page: z.coerce.number().int('page must be an integer').positive('page must be positive').default(1),
  pageSize: z.coerce
    .number()
    .int('pageSize must be an integer')
    .positive('pageSize must be positive')
    .max(MAX_CACHE_KEYS_PAGE_SIZE, `pageSize must be at most ${String(MAX_CACHE_KEYS_PAGE_SIZE)}`)
    .default(DEFAULT_CACHE_KEYS_PAGE_SIZE),
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
