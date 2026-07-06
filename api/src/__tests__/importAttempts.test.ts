import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { attempts as attemptsTable, imports as importsTable } from '../db/schema.js';
import type { ImportAttemptRow } from 'shared';

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

vi.mock('../services/importAttempts.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/importAttempts.js')>();
  return { ...actual, listImportAttempts: vi.fn(), deleteImportAttempts: vi.fn() };
});

import { auth } from '../lib/auth.js';
import { listImportAttempts, deleteImportAttempts } from '../services/importAttempts.js';
import { ImportProcessingError } from '../services/deleteImport.js';

const mockGetSession = vi.mocked(auth.api.getSession);
const mockListImportAttempts = vi.mocked(listImportAttempts);
const mockDeleteImportAttempts = vi.mocked(deleteImportAttempts);

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
// GET /api/imports/:id/attempts — route contract, service mocked at the edge
// ---------------------------------------------------------------------------

describe('GET /api/imports/:id/attempts', () => {
  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/imports/42/attempts');
    expect(res.status).toBe(401);
    expect(mockListImportAttempts).not.toHaveBeenCalled();
  });

  it('returns 404 IMPORT_NOT_FOUND for an unknown import id', async () => {
    mockListImportAttempts.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/imports/999/attempts');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('IMPORT_NOT_FOUND');
  });

  it('returns 400 VALIDATION_ERROR for a non-numeric import id', async () => {
    const app = createApp();
    const res = await app.request('/api/imports/not-a-number/attempts');
    expect(res.status).toBe(400);
    expect(mockListImportAttempts).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR for an out-of-range pageSize', async () => {
    const app = createApp();
    const res = await app.request('/api/imports/42/attempts?pageSize=99999');
    expect(res.status).toBe(400);
    expect(mockListImportAttempts).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR for an unknown decision value', async () => {
    const app = createApp();
    const res = await app.request('/api/imports/42/attempts?decision=NotARealDecision');
    expect(res.status).toBe(400);
    expect(mockListImportAttempts).not.toHaveBeenCalled();
  });

  it('defaults page and pageSize when omitted, and returns the page payload', async () => {
    const rows: ImportAttemptRow[] = [
      { id: 1, examNo: '00001', nameFr: 'Ahmed', nameAr: null, serie: 'SN', moyenne: '12.50', decision: 'Admis' },
    ];
    mockListImportAttempts.mockResolvedValue({
      rows,
      total: 1,
      page: 1,
      pageSize: 50,
      availableSeries: ['SN'],
    });
    const app = createApp();
    const res = await app.request('/api/imports/42/attempts');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { rows: ImportAttemptRow[]; total: number } };
    expect(body.data.rows).toEqual(rows);
    expect(body.data.total).toBe(1);
    expect(mockListImportAttempts).toHaveBeenCalledWith(
      {},
      42,
      expect.objectContaining({ page: 1, pageSize: 50 }),
    );
  });

  it('forwards search, serie, decision, and page query params to the service', async () => {
    mockListImportAttempts.mockResolvedValue({
      rows: [],
      total: 0,
      page: 2,
      pageSize: 25,
      availableSeries: [],
    });
    const app = createApp();
    const res = await app.request(
      '/api/imports/42/attempts?page=2&pageSize=25&search=Ahmed&serie=SN&decision=Admis',
    );

    expect(res.status).toBe(200);
    expect(mockListImportAttempts).toHaveBeenCalledWith(
      {},
      42,
      expect.objectContaining({ page: 2, pageSize: 25, search: 'Ahmed', serie: 'SN', decision: 'Admis' }),
    );
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/imports/:id/attempts — route contract, service mocked at the edge
// ---------------------------------------------------------------------------

describe('DELETE /api/imports/:id/attempts', () => {
  const deleteRequest = (id: string, body: unknown) =>
    createApp().request(`/api/imports/${id}/attempts`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await deleteRequest('42', { attemptIds: [1] });
    expect(res.status).toBe(401);
    expect(mockDeleteImportAttempts).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR for an empty attemptIds array', async () => {
    const res = await deleteRequest('42', { attemptIds: [] });
    expect(res.status).toBe(400);
    expect(mockDeleteImportAttempts).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR for a non-array attemptIds', async () => {
    const res = await deleteRequest('42', { attemptIds: 'not-an-array' });
    expect(res.status).toBe(400);
    expect(mockDeleteImportAttempts).not.toHaveBeenCalled();
  });

  it('returns 200 with the deleted count for a single-id delete', async () => {
    mockDeleteImportAttempts.mockResolvedValue({ deletedAttempts: 1 });
    const res = await deleteRequest('42', { attemptIds: [7] });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { deletedAttempts: number } };
    expect(body.data).toEqual({ deletedAttempts: 1 });
    expect(mockDeleteImportAttempts).toHaveBeenCalledWith({}, {}, {}, 42, [7]);
  });

  it('returns 200 with the deleted count for a bulk delete', async () => {
    mockDeleteImportAttempts.mockResolvedValue({ deletedAttempts: 3 });
    const res = await deleteRequest('42', { attemptIds: [7, 8, 9] });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { deletedAttempts: number } };
    expect(body.data).toEqual({ deletedAttempts: 3 });
    expect(mockDeleteImportAttempts).toHaveBeenCalledWith({}, {}, {}, 42, [7, 8, 9]);
  });

  it('returns 404 IMPORT_NOT_FOUND for an unknown import id', async () => {
    mockDeleteImportAttempts.mockResolvedValue(null);
    const res = await deleteRequest('999', { attemptIds: [1] });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('IMPORT_NOT_FOUND');
  });

  it('returns 409 IMPORT_PROCESSING while the import is still processing', async () => {
    mockDeleteImportAttempts.mockRejectedValue(new ImportProcessingError());
    const res = await deleteRequest('42', { attemptIds: [1] });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('IMPORT_PROCESSING');
  });

  it('returns 400 VALIDATION_ERROR for a non-numeric import id', async () => {
    const res = await deleteRequest('not-a-number', { attemptIds: [1] });
    expect(res.status).toBe(400);
    expect(mockDeleteImportAttempts).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// A generic thenable query-builder mock: every chain method returns the
// same object, and `await`ing it at any point resolves the next queued
// response. This matches how drizzle's real builders are themselves
// thenable at every step, and lets one fake `db` stand in for the several
// differently-shaped select chains these services issue in sequence.
// ---------------------------------------------------------------------------

function makeChain(response: unknown) {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    offset: () => chain,
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  return chain;
}

function makeDb(responses: unknown[]) {
  let i = 0;
  const next = () => {
    const r = responses[i];
    i += 1;
    return r;
  };
  return {
    select: () => makeChain(next()),
    selectDistinct: () => makeChain(next()),
  };
}

// ---------------------------------------------------------------------------
// listImportAttempts service — real implementation, DB mocked at the edge
// ---------------------------------------------------------------------------

describe('listImportAttempts service', () => {
  it('returns null for an unknown import id', async () => {
    const { listImportAttempts: realFn } = await vi.importActual<
      typeof import('../services/importAttempts.js')
    >('../services/importAttempts.js');

    const db = makeDb([[]]);
    const result = await realFn(db as never, 999, { page: 1, pageSize: 50 });
    expect(result).toBeNull();
  });

  it('returns a paginated page with total count and available series', async () => {
    const { listImportAttempts: realFn } = await vi.importActual<
      typeof import('../services/importAttempts.js')
    >('../services/importAttempts.js');

    const rows: ImportAttemptRow[] = [
      { id: 1, examNo: '00001', nameFr: 'Ahmed', nameAr: null, serie: 'SN', moyenne: '12.50', decision: 'Admis' },
      { id: 2, examNo: '00002', nameFr: 'Fatima', nameAr: null, serie: 'LM', moyenne: null, decision: 'Ajourné' },
    ];
    const db = makeDb([
      [{ id: 42 }], // import exists
      [{ value: 2 }], // total count
      rows, // page of rows
      [{ serie: 'LM' }, { serie: 'SN' }], // distinct series
    ]);

    const result = await realFn(db as never, 42, { page: 1, pageSize: 50 });

    expect(result).toEqual({
      rows,
      total: 2,
      page: 1,
      pageSize: 50,
      availableSeries: ['LM', 'SN'],
    });
  });

  it('returns an empty page with total 0 when no rows match the filters', async () => {
    const { listImportAttempts: realFn } = await vi.importActual<
      typeof import('../services/importAttempts.js')
    >('../services/importAttempts.js');

    const db = makeDb([[{ id: 42 }], [{ value: 0 }], [], [{ serie: 'SN' }]]);

    const result = await realFn(db as never, 42, {
      page: 1,
      pageSize: 50,
      search: 'nobody-matches-this',
    });

    expect(result).toEqual({ rows: [], total: 0, page: 1, pageSize: 50, availableSeries: ['SN'] });
  });
});

// ---------------------------------------------------------------------------
// deleteImportAttempts service — real implementation, DB/meili/redis mocked
// at the edge, proving the fan-out and the processing guard
// ---------------------------------------------------------------------------

describe('deleteImportAttempts service', () => {
  it('returns null for an unknown import id', async () => {
    const { deleteImportAttempts: realFn } = await vi.importActual<
      typeof import('../services/importAttempts.js')
    >('../services/importAttempts.js');

    const db = { select: () => makeChain([]) };
    const result = await realFn(db as never, {} as never, {} as never, 999, [1]);
    expect(result).toBeNull();
  });

  it('throws ImportProcessingError without deleting anything while the import is processing', async () => {
    const { deleteImportAttempts: realFn } = await vi.importActual<
      typeof import('../services/importAttempts.js')
    >('../services/importAttempts.js');

    let transactionCalled = false;
    const db = {
      select: () => makeChain([{ id: 42, status: 'processing', summaryInserted: 100 }]),
      transaction: () => {
        transactionCalled = true;
        throw new Error('should not delete while processing');
      },
    };

    await expect(realFn(db as never, {} as never, {} as never, 42, [1])).rejects.toBeInstanceOf(
      ImportProcessingError,
    );
    expect(transactionCalled).toBe(false);
  });

  it('ignores ids that do not belong to this import and reports zero deleted', async () => {
    const { deleteImportAttempts: realFn } = await vi.importActual<
      typeof import('../services/importAttempts.js')
    >('../services/importAttempts.js');

    let transactionCalled = false;
    const db = {
      select: (() => {
        let call = 0;
        return () => {
          call += 1;
          // Call 1: the existence check (`.limit(1)` then destructured) —
          // call 2: the attempts lookup scoped to the given ids, empty
          // because none of the requested ids belong to this import.
          if (call === 1) return makeChain([{ id: 42, status: 'completed', summaryInserted: 100 }]);
          return makeChain([]);
        };
      })(),
      transaction: () => {
        transactionCalled = true;
        return Promise.resolve();
      },
    };

    const result = await realFn(db as never, {} as never, {} as never, 42, [999]);
    expect(result).toEqual({ deletedAttempts: 0 });
    expect(transactionCalled).toBe(false);
  });

  it('deletes the given attempts, decrements the stored summary, invalidates caches, and reindexes Meilisearch', async () => {
    const { deleteImportAttempts: realFn } = await vi.importActual<
      typeof import('../services/importAttempts.js')
    >('../services/importAttempts.js');

    const deletedTables: unknown[] = [];
    const updatedSets: Record<string, unknown>[] = [];
    const tx = {
      delete: (table: unknown) => {
        deletedTables.push(table);
        return { where: () => Promise.resolve() };
      },
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => {
          if (table === importsTable) updatedSets.push(values);
          return { where: () => Promise.resolve() };
        },
      }),
    };

    let call = 0;
    const db = {
      select: () => {
        call += 1;
        if (call === 1) return makeChain([{ id: 42, status: 'completed', summaryInserted: 100 }]);
        return makeChain([
          { id: 1, examType: 'bac', examYear: 2024, examNo: '00001', slug: 'slug1' },
          { id: 2, examType: 'bac', examYear: 2024, examNo: '00002', slug: 'slug2' },
        ]);
      },
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
    };

    const meili = {
      index: () => ({
        updateSettings: vi.fn().mockResolvedValue(undefined),
        deleteAllDocuments: vi.fn().mockResolvedValue(undefined),
        addDocuments: vi.fn().mockResolvedValue(undefined),
      }),
    };

    const result = await realFn(db as never, meili as never, redis as never, 42, [1, 2]);

    expect(result).toEqual({ deletedAttempts: 2 });
    expect(deletedTables).toEqual([attemptsTable]);
    expect(updatedSets).toEqual([expect.objectContaining({ summaryInserted: 98 })]);
    expect(pipelineOps).toEqual(
      expect.arrayContaining(['exam:bac:2024:00001', 'result:slug1', 'exam:bac:2024:00002', 'result:slug2']),
    );
  });

  it('skips the summary update when the import never produced a summary yet', async () => {
    const { deleteImportAttempts: realFn } = await vi.importActual<
      typeof import('../services/importAttempts.js')
    >('../services/importAttempts.js');

    let updateCalled = false;
    const tx = {
      delete: () => ({ where: () => Promise.resolve() }),
      update: () => {
        updateCalled = true;
        return { set: () => ({ where: () => Promise.resolve() }) };
      },
    };

    let call = 0;
    const db = {
      select: () => {
        call += 1;
        if (call === 1) return makeChain([{ id: 42, status: 'pending', summaryInserted: null }]);
        return makeChain([{ id: 1, examType: 'bac', examYear: 2024, examNo: '00001', slug: 'slug1' }]);
      },
      transaction: (cb: (tx: unknown) => Promise<void>) => cb(tx),
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };

    const redis = {
      pipeline: () => ({ del: () => redis.pipeline(), exec: () => Promise.resolve([]) }),
    };
    const meili = {
      index: () => ({
        updateSettings: vi.fn().mockResolvedValue(undefined),
        deleteAllDocuments: vi.fn().mockResolvedValue(undefined),
        addDocuments: vi.fn().mockResolvedValue(undefined),
      }),
    };

    const result = await realFn(db as never, meili as never, redis as never, 42, [1]);
    expect(result).toEqual({ deletedAttempts: 1 });
    expect(updateCalled).toBe(false);
  });
});
