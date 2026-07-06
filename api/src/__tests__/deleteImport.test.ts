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

// Real ImportProcessingError class (so `err instanceof ImportProcessingError`
// in the route works) with the service function itself mocked at the boundary.
vi.mock('../services/deleteImport.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/deleteImport.js')>();
  return { ...actual, deleteImport: vi.fn() };
});

import { auth } from '../lib/auth.js';
import { deleteImport, ImportProcessingError } from '../services/deleteImport.js';

const mockGetSession = vi.mocked(auth.api.getSession);
const mockDeleteImport = vi.mocked(deleteImport);

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
// DELETE /api/imports/:id — route contract, service mocked at the edge
// ---------------------------------------------------------------------------

describe('DELETE /api/imports/:id', () => {
  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/imports/42', { method: 'DELETE' });
    expect(res.status).toBe(401);
    expect(mockDeleteImport).not.toHaveBeenCalled();
  });

  it('returns 200 with the deleted attempt count on success', async () => {
    mockDeleteImport.mockResolvedValue({ deletedAttempts: 4980 });
    const app = createApp();
    const res = await app.request('/api/imports/42', { method: 'DELETE' });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { deletedAttempts: number } };
    expect(body.data).toEqual({ deletedAttempts: 4980 });
    expect(mockDeleteImport).toHaveBeenCalledWith({}, {}, {}, 42);
  });

  it('returns 404 IMPORT_NOT_FOUND for an unknown import id', async () => {
    mockDeleteImport.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/imports/999', { method: 'DELETE' });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('IMPORT_NOT_FOUND');
  });

  it('returns 409 IMPORT_PROCESSING while the import is still processing', async () => {
    mockDeleteImport.mockRejectedValue(new ImportProcessingError());
    const app = createApp();
    const res = await app.request('/api/imports/42', { method: 'DELETE' });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('IMPORT_PROCESSING');
  });

  it('returns 400 VALIDATION_ERROR for a non-numeric import id', async () => {
    const app = createApp();
    const res = await app.request('/api/imports/not-a-number', { method: 'DELETE' });
    expect(res.status).toBe(400);
    expect(mockDeleteImport).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteImport service — real implementation against fake db/meili/redis
// chains, proving the full fan-out and the processing guard
// ---------------------------------------------------------------------------

describe('deleteImport service', () => {
  it('returns null for an unknown import id', async () => {
    const { deleteImport: realFn } =
      await vi.importActual<typeof import('../services/deleteImport.js')>(
        '../services/deleteImport.js',
      );

    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
    };

    const result = await realFn(db as never, {} as never, {} as never, 999);
    expect(result).toBeNull();
  });

  it('throws ImportProcessingError without deleting anything while the import is processing', async () => {
    const { deleteImport: realFn, ImportProcessingError: RealImportProcessingError } =
      await vi.importActual<typeof import('../services/deleteImport.js')>(
        '../services/deleteImport.js',
      );

    let transactionCalled = false;
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({ limit: () => Promise.resolve([{ id: 42, status: 'processing' }]) }),
        }),
      }),
      transaction: () => {
        transactionCalled = true;
        throw new Error('should not delete while processing');
      },
    };

    await expect(realFn(db as never, {} as never, {} as never, 42)).rejects.toBeInstanceOf(
      RealImportProcessingError,
    );
    expect(transactionCalled).toBe(false);
  });

  it('throws ImportProcessingError while an import is cancelling (task 032 kill/rollback may still be in flight)', async () => {
    const { deleteImport: realFn, ImportProcessingError: RealImportProcessingError } =
      await vi.importActual<typeof import('../services/deleteImport.js')>(
        '../services/deleteImport.js',
      );

    let transactionCalled = false;
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({ limit: () => Promise.resolve([{ id: 42, status: 'cancelling' }]) }),
        }),
      }),
      transaction: () => {
        transactionCalled = true;
        throw new Error('should not delete while cancelling');
      },
    };

    await expect(realFn(db as never, {} as never, {} as never, 42)).rejects.toBeInstanceOf(
      RealImportProcessingError,
    );
    expect(transactionCalled).toBe(false);
  });

  it('deletes attempts, rejects, and the import row in one transaction, then invalidates caches and reindexes Meilisearch', async () => {
    const { deleteImport: realFn } =
      await vi.importActual<typeof import('../services/deleteImport.js')>(
        '../services/deleteImport.js',
      );

    const deletedTables: unknown[] = [];
    const tx = {
      delete: (table: unknown) => {
        deletedTables.push(table);
        return { where: () => Promise.resolve() };
      },
    };

    const db = {
      select: (fields: unknown) => ({
        from: (table: unknown) => ({
          where: () => {
            if (table === importsTable) {
              return { limit: () => Promise.resolve([{ id: 42, status: 'completed' }]) };
            }
            // deleteImport's attempts-lookup query (no .limit chained)
            void fields;
            return Promise.resolve([
              { examType: 'bac', examYear: 2024, examNo: '00042', slug: 'slug1' },
              { examType: 'bac', examYear: 2024, examNo: '00043', slug: 'slug2' },
            ]);
          },
        }),
      }),
      transaction: (cb: (tx: unknown) => Promise<void>) => cb(tx),
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

    const result = await realFn(db as never, meili as never, redis as never, 42);

    expect(result).toEqual({ deletedAttempts: 2 });
    // attempts + rejects deleted before the import row itself (FK order).
    expect(deletedTables).toHaveLength(3);
    expect(pipelineOps).toEqual(
      expect.arrayContaining(['exam:bac:2024:00042', 'result:slug1', 'exam:bac:2024:00043', 'result:slug2']),
    );
  });

  it('reports zero deleted attempts and skips the redis pipeline for an import that never produced any', async () => {
    const { deleteImport: realFn } =
      await vi.importActual<typeof import('../services/deleteImport.js')>(
        '../services/deleteImport.js',
      );

    const db = {
      select: (fields: unknown) => ({
        from: (table: unknown) => ({
          where: () => {
            if (table === importsTable) {
              return { limit: () => Promise.resolve([{ id: 7, status: 'failed' }]) };
            }
            void fields;
            return Promise.resolve([]);
          },
        }),
      }),
      transaction: (cb: (tx: unknown) => Promise<void>) =>
        cb({ delete: () => ({ where: () => Promise.resolve() }) }),
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };

    let pipelineCalled = false;
    const redis = {
      pipeline: () => {
        pipelineCalled = true;
        return { del: () => redis.pipeline(), exec: () => Promise.resolve([]) };
      },
      del: vi.fn().mockResolvedValue(1),
    };

    const meili = {
      index: () => ({
        updateSettings: vi.fn().mockResolvedValue(undefined),
        deleteAllDocuments: vi.fn().mockResolvedValue(undefined),
        addDocuments: vi.fn().mockResolvedValue(undefined),
      }),
    };

    const result = await realFn(db as never, meili as never, redis as never, 7);

    expect(result).toEqual({ deletedAttempts: 0 });
    expect(pipelineCalled).toBe(false);
    // the years-list cache is still invalidated unconditionally
    // The published-years cache is namespaced per exam type; both are cleared.
    expect(redis.del).toHaveBeenCalledWith('years:published:bac', 'years:published:brevet');
  });
});
