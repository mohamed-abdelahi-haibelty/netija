import type { RedisClient } from '../lib/redis.js';
import type {
  CacheStatusResult,
  CacheKeyEntry,
  CacheKeysListResult,
  CacheKeyInspectResult,
  CacheInvalidateResult,
  CacheFlushResult,
} from 'shared';

// Admin cache visibility is scoped strictly to the two result-cache key
// families this project actually caches results under (examSearch.ts's
// `exam:{year}:{examNo}` and studentPage.ts's `result:{slug}`) — never
// rate-limit counters or BullMQ's own `bull:*` keys, both of which also live
// in this same Redis instance (architecture.md).
const RESULT_CACHE_PREFIXES = ['exam:', 'result:'] as const;

// Thrown whenever a caller-supplied key or pattern falls outside the two
// scoped prefixes above. The route turns this into 400 CACHE_KEY_OUT_OF_SCOPE
// — never a generic 500, since this is an expected, deliberate guard rail,
// not a bug (error-handling.md).
export class CacheKeyOutOfScopeError extends Error {
  constructor(value: string) {
    super(
      `"${value}" is outside the result cache. Only keys starting with ${RESULT_CACHE_PREFIXES.join(' or ')} can be viewed or invalidated here.`,
    );
    this.name = 'CacheKeyOutOfScopeError';
  }
}

function assertScoped(value: string): void {
  if (!RESULT_CACHE_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    throw new CacheKeyOutOfScopeError(value);
  }
}

// SCAN, never KEYS: this runs against the same production Redis instance
// serving live search/result traffic, and KEYS blocks the whole server for
// the duration of the walk. SCAN's cursor is cheap enough at this project's
// scale (admin dashboard, not a hot path) and never touches the main thread
// for more than one keyspace slice at a time.
async function scanKeys(redis: RedisClient, pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    keys.push(...batch);
    cursor = nextCursor;
  } while (cursor !== '0');
  return keys;
}

// No pattern → every scoped key across both prefixes. A pattern → validated
// against the scope guard first, then scanned as-is (so `exam:2024:*` still
// narrows within the exam: family).
async function scanScopedKeys(redis: RedisClient, pattern?: string): Promise<string[]> {
  if (pattern === undefined) {
    const perPrefix = await Promise.all(RESULT_CACHE_PREFIXES.map((prefix) => scanKeys(redis, `${prefix}*`)));
    return perPrefix.flat();
  }
  assertScoped(pattern);
  return scanKeys(redis, pattern);
}

export async function getCacheStatus(redis: RedisClient): Promise<CacheStatusResult> {
  // An explicit two-element tuple (not `.map` over the prefix list) so
  // destructuring is typed soundly under noUncheckedIndexedAccess.
  const [examKeys, resultKeys] = await Promise.all([scanKeys(redis, 'exam:*'), scanKeys(redis, 'result:*')]);
  return {
    examKeyCount: examKeys.length,
    resultKeyCount: resultKeys.length,
    totalKeyCount: examKeys.length + resultKeys.length,
  };
}

// Keys are sorted before paging so repeated requests against a stable
// keyspace return a stable order — SCAN itself gives no ordering guarantee.
export async function listCacheKeys(
  redis: RedisClient,
  params: { pattern?: string; page: number; pageSize: number },
): Promise<CacheKeysListResult> {
  const { pattern, page, pageSize } = params;
  const allKeys = (await scanScopedKeys(redis, pattern)).sort();
  const start = (page - 1) * pageSize;
  const pageKeys = allKeys.slice(start, start + pageSize);

  const keys: CacheKeyEntry[] =
    pageKeys.length === 0
      ? []
      : await (async () => {
          const pipeline = redis.pipeline();
          for (const key of pageKeys) pipeline.ttl(key);
          const results = await pipeline.exec();
          return pageKeys.map((key, i) => ({
            key,
            ttl: (results?.[i]?.[1] as number | undefined) ?? -1,
          }));
        })();

  return { keys, total: allKeys.length, page, pageSize };
}

export async function inspectCacheKey(redis: RedisClient, key: string): Promise<CacheKeyInspectResult | null> {
  assertScoped(key);
  const [value, ttl] = await Promise.all([redis.get(key), redis.ttl(key)]);
  if (value === null) return null;
  return { key, ttl, value: JSON.parse(value) as unknown };
}

export async function invalidateCacheKey(redis: RedisClient, key: string): Promise<CacheInvalidateResult> {
  assertScoped(key);
  const deleted = await redis.del(key);
  return { deleted: deleted > 0 };
}

// Flushes either the whole result cache (no pattern) or only the keys
// matching a caller-supplied pattern (still scope-guarded) — covers both
// "invalidate all result keys" and "invalidate by pattern" from the task
// spec through the same function.
export async function flushResultCache(redis: RedisClient, pattern?: string): Promise<CacheFlushResult> {
  const keys = await scanScopedKeys(redis, pattern);
  if (keys.length === 0) return { deletedCount: 0 };
  const deletedCount = await redis.del(...keys);
  return { deletedCount };
}
