// Task 035 — Redis result-cache visibility and invalidation from the admin
// dashboard. Scoped strictly to the two result-cache key families
// (`exam:{year}:{examNo}`, `result:{slug}`) — rate-limit counters and
// BullMQ's own keys must never be visible or touchable through this panel.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import type { CacheStatusResult, CacheKeysListResult, CacheKeyInspectResult } from 'shared';

vi.mock('../lib/auth.js', () => ({
  auth: {
    handler: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    api: { getSession: vi.fn() },
  },
}));

vi.mock('../lib/healthChecks.js', () => ({
  checkPostgres: vi.fn().mockResolvedValue(true),
  checkRedis: vi.fn().mockResolvedValue(true),
  checkMeilisearch: vi.fn().mockResolvedValue(true),
}));

vi.mock('../db/client.js', () => ({ db: {} }));
vi.mock('../lib/redis.js', () => ({ redis: {} }));
vi.mock('../lib/meili.js', () => ({ meili: {}, ATTEMPTS_INDEX: 'attempts' }));
vi.mock('../lib/queue.js', () => ({
  importQueue: { add: vi.fn() },
  IMPORT_JOB_ATTEMPTS: 3,
  IMPORT_JOB_BACKOFF_MS: 2000,
}));

vi.mock('../services/cacheAdmin.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/cacheAdmin.js')>();
  return {
    ...actual,
    getCacheStatus: vi.fn(),
    listCacheKeys: vi.fn(),
    inspectCacheKey: vi.fn(),
    invalidateCacheKey: vi.fn(),
    flushResultCache: vi.fn(),
  };
});

import { auth } from '../lib/auth.js';
import {
  getCacheStatus,
  listCacheKeys,
  inspectCacheKey,
  invalidateCacheKey,
  flushResultCache,
  CacheKeyOutOfScopeError,
} from '../services/cacheAdmin.js';

const mockGetSession = vi.mocked(auth.api.getSession);
const mockGetCacheStatus = vi.mocked(getCacheStatus);
const mockListCacheKeys = vi.mocked(listCacheKeys);
const mockInspectCacheKey = vi.mocked(inspectCacheKey);
const mockInvalidateCacheKey = vi.mocked(invalidateCacheKey);
const mockFlushResultCache = vi.mocked(flushResultCache);

const VALID_SESSION = {
  user: {
    id: 'u1',
    email: 'admin@test.com',
    name: 'Admin',
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  session: {
    id: 's1',
    userId: 'u1',
    expiresAt: new Date(Date.now() + 3_600_000),
    token: 'tok',
    ipAddress: null,
    userAgent: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(VALID_SESSION);
});

// ---------------------------------------------------------------------------
// GET /api/cache/status
// ---------------------------------------------------------------------------

describe('GET /api/cache/status', () => {
  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/cache/status');
    expect(res.status).toBe(401);
    expect(mockGetCacheStatus).not.toHaveBeenCalled();
  });

  it('returns 200 with the key counts', async () => {
    const status: CacheStatusResult = { examKeyCount: 3, resultKeyCount: 5, totalKeyCount: 8 };
    mockGetCacheStatus.mockResolvedValue(status);
    const app = createApp();
    const res = await app.request('/api/cache/status');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: CacheStatusResult };
    expect(body.data).toEqual(status);
  });
});

// ---------------------------------------------------------------------------
// GET /api/cache/keys
// ---------------------------------------------------------------------------

describe('GET /api/cache/keys', () => {
  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/cache/keys');
    expect(res.status).toBe(401);
    expect(mockListCacheKeys).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR for an out-of-range pageSize', async () => {
    const app = createApp();
    const res = await app.request('/api/cache/keys?pageSize=99999');
    expect(res.status).toBe(400);
    expect(mockListCacheKeys).not.toHaveBeenCalled();
  });

  it('defaults page/pageSize and returns the page payload, unfiltered', async () => {
    const result: CacheKeysListResult = {
      keys: [{ key: 'exam:2024:00001', ttl: 120 }],
      total: 1,
      page: 1,
      pageSize: 20,
    };
    mockListCacheKeys.mockResolvedValue(result);
    const app = createApp();
    const res = await app.request('/api/cache/keys');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: CacheKeysListResult };
    expect(body.data).toEqual(result);
    expect(mockListCacheKeys).toHaveBeenCalledWith({}, expect.objectContaining({ page: 1, pageSize: 20 }));
  });

  it('forwards pattern, page, and pageSize to the service', async () => {
    mockListCacheKeys.mockResolvedValue({ keys: [], total: 0, page: 2, pageSize: 10 });
    const app = createApp();
    const res = await app.request('/api/cache/keys?pattern=exam%3A2024%3A*&page=2&pageSize=10');
    expect(res.status).toBe(200);
    expect(mockListCacheKeys).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ pattern: 'exam:2024:*', page: 2, pageSize: 10 }),
    );
  });

  it('returns 400 CACHE_KEY_OUT_OF_SCOPE when the service rejects an out-of-scope pattern', async () => {
    mockListCacheKeys.mockRejectedValue(new CacheKeyOutOfScopeError('bull:*'));
    const app = createApp();
    const res = await app.request('/api/cache/keys?pattern=bull%3A*');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('CACHE_KEY_OUT_OF_SCOPE');
  });
});

// ---------------------------------------------------------------------------
// GET /api/cache/keys/:key
// ---------------------------------------------------------------------------

describe('GET /api/cache/keys/:key', () => {
  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/cache/keys/result:abc');
    expect(res.status).toBe(401);
    expect(mockInspectCacheKey).not.toHaveBeenCalled();
  });

  it('returns 200 with the key value and ttl', async () => {
    const result: CacheKeyInspectResult = { key: 'result:abc', ttl: 300, value: { examNo: '00001' } };
    mockInspectCacheKey.mockResolvedValue(result);
    const app = createApp();
    const res = await app.request('/api/cache/keys/result:abc');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: CacheKeyInspectResult };
    expect(body.data).toEqual(result);
  });

  it('returns 404 CACHE_KEY_NOT_FOUND when the key does not exist', async () => {
    mockInspectCacheKey.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/cache/keys/result:missing');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('CACHE_KEY_NOT_FOUND');
  });

  it('returns 400 CACHE_KEY_OUT_OF_SCOPE for a key outside the result cache', async () => {
    mockInspectCacheKey.mockRejectedValue(new CacheKeyOutOfScopeError('bull:import-queue:1'));
    const app = createApp();
    const res = await app.request('/api/cache/keys/bull:import-queue:1');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('CACHE_KEY_OUT_OF_SCOPE');
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/cache/keys/:key
// ---------------------------------------------------------------------------

describe('DELETE /api/cache/keys/:key', () => {
  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/cache/keys/result:abc', { method: 'DELETE' });
    expect(res.status).toBe(401);
    expect(mockInvalidateCacheKey).not.toHaveBeenCalled();
  });

  it('returns 200 with deleted true', async () => {
    mockInvalidateCacheKey.mockResolvedValue({ deleted: true });
    const app = createApp();
    const res = await app.request('/api/cache/keys/result:abc', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { deleted: boolean } };
    expect(body.data).toEqual({ deleted: true });
  });

  it('returns 400 CACHE_KEY_OUT_OF_SCOPE for a rate-limit key', async () => {
    mockInvalidateCacheKey.mockRejectedValue(new CacheKeyOutOfScopeError('ratelimit:1.2.3.4'));
    const app = createApp();
    const res = await app.request('/api/cache/keys/ratelimit:1.2.3.4', { method: 'DELETE' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('CACHE_KEY_OUT_OF_SCOPE');
  });
});

// ---------------------------------------------------------------------------
// POST /api/cache/flush
// ---------------------------------------------------------------------------

describe('POST /api/cache/flush', () => {
  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/cache/flush', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
    expect(mockFlushResultCache).not.toHaveBeenCalled();
  });

  it('flushes the whole result cache with no pattern', async () => {
    mockFlushResultCache.mockResolvedValue({ deletedCount: 8 });
    const app = createApp();
    const res = await app.request('/api/cache/flush', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { deletedCount: number } };
    expect(body.data).toEqual({ deletedCount: 8 });
    expect(mockFlushResultCache).toHaveBeenCalledWith({}, undefined);
  });

  it('forwards a pattern to the service', async () => {
    mockFlushResultCache.mockResolvedValue({ deletedCount: 2 });
    const app = createApp();
    const res = await app.request('/api/cache/flush', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern: 'exam:2024:*' }),
    });
    expect(res.status).toBe(200);
    expect(mockFlushResultCache).toHaveBeenCalledWith({}, 'exam:2024:*');
  });

  it('returns 400 CACHE_KEY_OUT_OF_SCOPE for an out-of-scope pattern', async () => {
    mockFlushResultCache.mockRejectedValue(new CacheKeyOutOfScopeError('bull:*'));
    const app = createApp();
    const res = await app.request('/api/cache/flush', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern: 'bull:*' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('CACHE_KEY_OUT_OF_SCOPE');
  });
});

// ---------------------------------------------------------------------------
// cacheAdmin service — real implementation, a fake ioredis client at the edge
// ---------------------------------------------------------------------------

// A minimal fake standing in for ioredis: `scan` walks a fixed in-memory
// keyspace one page at a time (proving pagination doesn't rely on KEYS),
// `pipeline` records queued `ttl` calls and resolves them in order on `exec`.
function makeFakeRedis(keyspace: Record<string, { value: string; ttl: number }>) {
  return {
    scan: vi.fn((cursor: string, _match: string, pattern: string, _count: string, _n: number) => {
      void _match;
      void _count;
      void _n;
      const glob = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
      const allMatching = Object.keys(keyspace).filter((k) => glob.test(k));
      const start = Number(cursor);
      const batch = allMatching.slice(start, start + 1);
      const nextCursor = start + 1 < allMatching.length ? String(start + 1) : '0';
      return Promise.resolve([nextCursor, batch]);
    }),
    get: vi.fn((key: string) => Promise.resolve(keyspace[key]?.value ?? null)),
    ttl: vi.fn((key: string) => Promise.resolve(keyspace[key]?.ttl ?? -2)),
    del: vi.fn((...keys: string[]) => Promise.resolve(keys.filter((k) => k in keyspace).length)),
    pipeline: vi.fn(() => {
      const ops: string[] = [];
      const p = {
        ttl: (key: string) => {
          ops.push(key);
          return p;
        },
        exec: () => Promise.resolve(ops.map((key) => [null, keyspace[key]?.ttl ?? -2])),
      };
      return p;
    }),
  };
}

describe('getCacheStatus service', () => {
  it('counts exam: and result: keys separately', async () => {
    const { getCacheStatus: realFn } = await vi.importActual<typeof import('../services/cacheAdmin.js')>(
      '../services/cacheAdmin.js',
    );
    const redis = makeFakeRedis({
      'exam:2024:00001': { value: '{}', ttl: 100 },
      'exam:2024:00002': { value: '{}', ttl: 100 },
      'result:abc': { value: '{}', ttl: 300 },
    });

    const result = await realFn(redis as never);
    expect(result).toEqual({ examKeyCount: 2, resultKeyCount: 1, totalKeyCount: 3 });
  });
});

describe('listCacheKeys service', () => {
  it('pages through scoped keys, sorted, with ttl attached', async () => {
    const { listCacheKeys: realFn } = await vi.importActual<typeof import('../services/cacheAdmin.js')>(
      '../services/cacheAdmin.js',
    );
    const redis = makeFakeRedis({
      'result:b': { value: '{}', ttl: 200 },
      'result:a': { value: '{}', ttl: 100 },
    });

    const result = await realFn(redis as never, { page: 1, pageSize: 1 });
    expect(result).toEqual({ keys: [{ key: 'result:a', ttl: 100 }], total: 2, page: 1, pageSize: 1 });
  });

  it('rejects an out-of-scope pattern before scanning', async () => {
    const { listCacheKeys: realFn, CacheKeyOutOfScopeError: RealError } = await vi.importActual<
      typeof import('../services/cacheAdmin.js')
    >('../services/cacheAdmin.js');
    const redis = makeFakeRedis({});

    await expect(realFn(redis as never, { pattern: 'bull:*', page: 1, pageSize: 20 })).rejects.toBeInstanceOf(
      RealError,
    );
    expect(redis.scan).not.toHaveBeenCalled();
  });
});

describe('inspectCacheKey service', () => {
  it('returns the parsed value and ttl for an existing scoped key', async () => {
    const { inspectCacheKey: realFn } = await vi.importActual<typeof import('../services/cacheAdmin.js')>(
      '../services/cacheAdmin.js',
    );
    const redis = makeFakeRedis({ 'result:abc': { value: JSON.stringify({ examNo: '00001' }), ttl: 300 } });

    const result = await realFn(redis as never, 'result:abc');
    expect(result).toEqual({ key: 'result:abc', ttl: 300, value: { examNo: '00001' } });
  });

  it('returns null for a scoped key that does not exist', async () => {
    const { inspectCacheKey: realFn } = await vi.importActual<typeof import('../services/cacheAdmin.js')>(
      '../services/cacheAdmin.js',
    );
    const redis = makeFakeRedis({});

    const result = await realFn(redis as never, 'result:missing');
    expect(result).toBeNull();
  });

  it('rejects a rate-limit key without touching redis', async () => {
    const { inspectCacheKey: realFn, CacheKeyOutOfScopeError: RealError } = await vi.importActual<
      typeof import('../services/cacheAdmin.js')
    >('../services/cacheAdmin.js');
    const redis = makeFakeRedis({});

    await expect(realFn(redis as never, 'ratelimit:1.2.3.4')).rejects.toBeInstanceOf(RealError);
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('rejects a BullMQ internal key without touching redis', async () => {
    const { inspectCacheKey: realFn, CacheKeyOutOfScopeError: RealError } = await vi.importActual<
      typeof import('../services/cacheAdmin.js')
    >('../services/cacheAdmin.js');
    const redis = makeFakeRedis({});

    await expect(realFn(redis as never, 'bull:import-queue:1')).rejects.toBeInstanceOf(RealError);
    expect(redis.get).not.toHaveBeenCalled();
  });
});

describe('invalidateCacheKey service', () => {
  it('deletes an existing scoped key', async () => {
    const { invalidateCacheKey: realFn } = await vi.importActual<typeof import('../services/cacheAdmin.js')>(
      '../services/cacheAdmin.js',
    );
    const redis = makeFakeRedis({ 'exam:2024:00001': { value: '{}', ttl: 100 } });

    const result = await realFn(redis as never, 'exam:2024:00001');
    expect(result).toEqual({ deleted: true });
  });

  it('reports deleted false for a key that does not exist', async () => {
    const { invalidateCacheKey: realFn } = await vi.importActual<typeof import('../services/cacheAdmin.js')>(
      '../services/cacheAdmin.js',
    );
    const redis = makeFakeRedis({});

    const result = await realFn(redis as never, 'exam:2024:99999');
    expect(result).toEqual({ deleted: false });
  });

  it('rejects an out-of-scope key without calling del', async () => {
    const { invalidateCacheKey: realFn, CacheKeyOutOfScopeError: RealError } = await vi.importActual<
      typeof import('../services/cacheAdmin.js')
    >('../services/cacheAdmin.js');
    const redis = makeFakeRedis({});

    await expect(realFn(redis as never, 'bull:import-queue:1')).rejects.toBeInstanceOf(RealError);
    expect(redis.del).not.toHaveBeenCalled();
  });
});

describe('flushResultCache service', () => {
  it('deletes every scoped key across both families when no pattern is given', async () => {
    const { flushResultCache: realFn } = await vi.importActual<typeof import('../services/cacheAdmin.js')>(
      '../services/cacheAdmin.js',
    );
    const redis = makeFakeRedis({
      'exam:2024:00001': { value: '{}', ttl: 100 },
      'result:abc': { value: '{}', ttl: 300 },
    });

    const result = await realFn(redis as never);
    expect(result).toEqual({ deletedCount: 2 });
    expect(redis.del).toHaveBeenCalledWith('exam:2024:00001', 'result:abc');
  });

  it('deletes only keys matching a given pattern', async () => {
    const { flushResultCache: realFn } = await vi.importActual<typeof import('../services/cacheAdmin.js')>(
      '../services/cacheAdmin.js',
    );
    const redis = makeFakeRedis({
      'exam:2024:00001': { value: '{}', ttl: 100 },
      'exam:2023:00001': { value: '{}', ttl: 100 },
      'result:abc': { value: '{}', ttl: 300 },
    });

    const result = await realFn(redis as never, 'exam:2024:*');
    expect(result).toEqual({ deletedCount: 1 });
    expect(redis.del).toHaveBeenCalledWith('exam:2024:00001');
  });

  it('returns zero and skips del when nothing matches', async () => {
    const { flushResultCache: realFn } = await vi.importActual<typeof import('../services/cacheAdmin.js')>(
      '../services/cacheAdmin.js',
    );
    const redis = makeFakeRedis({});

    const result = await realFn(redis as never);
    expect(result).toEqual({ deletedCount: 0 });
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('rejects flushing by an out-of-scope pattern', async () => {
    const { flushResultCache: realFn, CacheKeyOutOfScopeError: RealError } = await vi.importActual<
      typeof import('../services/cacheAdmin.js')
    >('../services/cacheAdmin.js');
    const redis = makeFakeRedis({});

    await expect(realFn(redis as never, 'ratelimit:*')).rejects.toBeInstanceOf(RealError);
    expect(redis.del).not.toHaveBeenCalled();
  });
});
