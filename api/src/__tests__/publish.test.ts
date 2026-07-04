import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { imports as importsTable } from '../db/schema.js';

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

// Real SmokeNotPassedError class (so `err instanceof SmokeNotPassedError` in
// the route works) with the two service functions mocked at the boundary.
vi.mock('../services/publish.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/publish.js')>();
  return { ...actual, publishImport: vi.fn(), unpublishImport: vi.fn() };
});

import { auth } from '../lib/auth.js';
import { publishImport, unpublishImport, SmokeNotPassedError } from '../services/publish.js';

const mockGetSession = vi.mocked(auth.api.getSession);
const mockPublishImport = vi.mocked(publishImport);
const mockUnpublishImport = vi.mocked(unpublishImport);

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
// POST /api/imports/:id/publish — route contract, service mocked at the edge
// ---------------------------------------------------------------------------

describe('POST /api/imports/:id/publish', () => {
  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/imports/42/publish', { method: 'POST' });
    expect(res.status).toBe(401);
    expect(mockPublishImport).not.toHaveBeenCalled();
  });

  it('returns 200 and flips published on success', async () => {
    mockPublishImport.mockResolvedValue({ published: true });
    const app = createApp();
    const res = await app.request('/api/imports/42/publish', { method: 'POST' });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { published: boolean } };
    expect(body.data).toEqual({ published: true });
    expect(mockPublishImport).toHaveBeenCalledWith({}, {}, {}, 42);
  });

  it('returns 404 IMPORT_NOT_FOUND for an unknown import id', async () => {
    mockPublishImport.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/imports/999/publish', { method: 'POST' });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('IMPORT_NOT_FOUND');
  });

  it('returns 409 SMOKE_NOT_PASSED when the smoke check has not passed', async () => {
    mockPublishImport.mockRejectedValue(new SmokeNotPassedError());
    const app = createApp();
    const res = await app.request('/api/imports/42/publish', { method: 'POST' });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('SMOKE_NOT_PASSED');
  });

  it('returns 400 VALIDATION_ERROR for a non-numeric import id', async () => {
    const app = createApp();
    const res = await app.request('/api/imports/not-a-number/publish', { method: 'POST' });
    expect(res.status).toBe(400);
    expect(mockPublishImport).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/imports/:id/unpublish — route contract
// ---------------------------------------------------------------------------

describe('POST /api/imports/:id/unpublish', () => {
  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/imports/42/unpublish', { method: 'POST' });
    expect(res.status).toBe(401);
    expect(mockUnpublishImport).not.toHaveBeenCalled();
  });

  it('returns 200 and flips published to false — reverses a publish unconditionally (no smoke gate)', async () => {
    mockUnpublishImport.mockResolvedValue({ published: false });
    const app = createApp();
    const res = await app.request('/api/imports/42/unpublish', { method: 'POST' });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { published: boolean } };
    expect(body.data).toEqual({ published: false });
  });

  it('returns 404 IMPORT_NOT_FOUND for an unknown import id', async () => {
    mockUnpublishImport.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/imports/999/unpublish', { method: 'POST' });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('IMPORT_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// publishImport / unpublishImport services — real implementation against
// fake db/meili/redis chains
// ---------------------------------------------------------------------------

describe('publishImport service', () => {
  it('throws SmokeNotPassedError without touching the DB when smokePassed is not true', async () => {
    const { publishImport: realFn } =
      await vi.importActual<typeof import('../services/publish.js')>('../services/publish.js');

    let updateCalled = false;
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({ limit: () => Promise.resolve([{ id: 42, smokePassed: false }]) }),
        }),
      }),
      update: () => {
        updateCalled = true;
        throw new Error('should not update when smoke has not passed');
      },
    };

    await expect(realFn(db as never, {} as never, {} as never, 42)).rejects.toThrow(
      'Publishing is blocked until the automated smoke verification passes.',
    );
    expect(updateCalled).toBe(false);
  });

  it('throws SmokeNotPassedError when smokePassed is null (never run)', async () => {
    const { publishImport: realFn, SmokeNotPassedError: RealSmokeNotPassedError } =
      await vi.importActual<typeof import('../services/publish.js')>('../services/publish.js');

    const db = {
      select: () => ({
        from: () => ({
          where: () => ({ limit: () => Promise.resolve([{ id: 42, smokePassed: null }]) }),
        }),
      }),
    };

    await expect(realFn(db as never, {} as never, {} as never, 42)).rejects.toBeInstanceOf(
      RealSmokeNotPassedError,
    );
  });

  it('returns null for an unknown import id', async () => {
    const { publishImport: realFn } =
      await vi.importActual<typeof import('../services/publish.js')>('../services/publish.js');

    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
    };

    const result = await realFn(db as never, {} as never, {} as never, 999);
    expect(result).toBeNull();
  });

  it('flips published, reindexes Meilisearch, and invalidates caches for every attempt in the import', async () => {
    const { publishImport: realFn } =
      await vi.importActual<typeof import('../services/publish.js')>('../services/publish.js');

    let updateSetValues: Record<string, unknown> | undefined;
    const db = {
      select: (fields: unknown) => ({
        from: (table: unknown) => ({
          where: () => {
            if (table === importsTable) {
              return { limit: () => Promise.resolve([{ id: 42, smokePassed: true }]) };
            }
            // invalidateImportCaches' attempts query (no .limit chained)
            void fields;
            return Promise.resolve([
              { examYear: 2024, examNo: '00042', slug: 'slug1' },
              { examYear: 2024, examNo: '00043', slug: 'slug2' },
            ]);
          },
        }),
      }),
      update: (table: unknown) => {
        if (table !== importsTable) throw new Error('unexpected update table');
        return {
          set: (values: Record<string, unknown>) => {
            updateSetValues = values;
            return { where: () => ({ returning: () => Promise.resolve([{ id: 42 }]) }) };
          },
        };
      },
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };

    const pipelineOps: string[] = [];
    const redis = {
      pipeline: () => ({
        del: (key: string) => {
          pipelineOps.push(key);
          return redis.pipeline();
        },
        exec: () => Promise.resolve([]),
      }),
      del: vi.fn().mockResolvedValue(1),
    };

    const meili = {
      index: () => ({
        updateSettings: vi.fn().mockResolvedValue(undefined),
        deleteAllDocuments: vi.fn().mockResolvedValue(undefined),
        addDocuments: vi.fn().mockResolvedValue(undefined),
      }),
    };

    // purgeCloudflareCache no-ops when CLOUDFLARE_API_TOKEN/CLOUDFLARE_ZONE_ID
    // aren't set (true in this test env — see .env.example), so it's exercised
    // for real here rather than mocked; its own no-op behavior is covered by
    // cloudflare.test.ts.
    const result = await realFn(db as never, meili as never, redis as never, 42);

    expect(result).toEqual({ published: true });
    expect(updateSetValues).toMatchObject({ published: true });
    expect(pipelineOps).toEqual(
      expect.arrayContaining(['exam:2024:00042', 'result:slug1', 'exam:2024:00043', 'result:slug2']),
    );
  });
});

describe('unpublishImport service', () => {
  it('returns null for an unknown import id', async () => {
    const { unpublishImport: realFn } =
      await vi.importActual<typeof import('../services/publish.js')>('../services/publish.js');

    const db = {
      update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) }),
    };

    const result = await realFn(db as never, {} as never, {} as never, 999);
    expect(result).toBeNull();
  });

  it('flips published to false unconditionally (no smoke check)', async () => {
    const { unpublishImport: realFn } =
      await vi.importActual<typeof import('../services/publish.js')>('../services/publish.js');

    let updateSetValues: Record<string, unknown> | undefined;
    const db = {
      update: (table: unknown) => {
        if (table !== importsTable) throw new Error('unexpected update table');
        return {
          set: (values: Record<string, unknown>) => {
            updateSetValues = values;
            return { where: () => ({ returning: () => Promise.resolve([{ id: 42 }]) }) };
          },
        };
      },
      select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const redis = { pipeline: () => ({ del: () => redis.pipeline(), exec: () => Promise.resolve([]) }), del: vi.fn() };
    const meili = {
      index: () => ({
        updateSettings: vi.fn().mockResolvedValue(undefined),
        deleteAllDocuments: vi.fn().mockResolvedValue(undefined),
        addDocuments: vi.fn().mockResolvedValue(undefined),
      }),
    };

    const result = await realFn(db as never, meili as never, redis as never, 42);

    expect(result).toEqual({ published: false });
    expect(updateSetValues).toMatchObject({ published: false });
  });
});
