import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { imports as importsTable, columnAliases } from '../db/schema.js';

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
vi.mock('../lib/queue.js', () => ({
  importQueue: { add: vi.fn() },
  IMPORT_JOB_ATTEMPTS: 3,
  IMPORT_JOB_BACKOFF_MS: 2000,
}));

vi.mock('../services/confirm.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/confirm.js')>();
  return { ...actual, confirmImport: vi.fn() };
});

import { auth } from '../lib/auth.js';
import { confirmImport, MissingRequiredColumnsError } from '../services/confirm.js';
import { importQueue } from '../lib/queue.js';

const mockGetSession = vi.mocked(auth.api.getSession);
const mockConfirmImport = vi.mocked(confirmImport);

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

const VALID_PAYLOAD = {
  mapping: { NODOSS: 'exam_no', NOMPL: 'name_fr' },
  examYear: 2024,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(VALID_SESSION);
});

// ---------------------------------------------------------------------------
// Route contract — confirmImport service mocked at the boundary
// ---------------------------------------------------------------------------

describe('POST /api/imports/:id/confirm', () => {
  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/imports/1/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_PAYLOAD),
    });
    expect(res.status).toBe(401);
    expect(mockConfirmImport).not.toHaveBeenCalled();
  });

  it('returns 202 on a valid payload and calls confirmImport with the parsed body', async () => {
    mockConfirmImport.mockResolvedValue({ status: 'processing' });
    const app = createApp();
    const res = await app.request('/api/imports/42/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_PAYLOAD),
    });

    expect(res.status).toBe(202);
    const body = (await res.json()) as { data: { status: string } };
    expect(body.data).toEqual({ status: 'processing' });
    expect(mockConfirmImport).toHaveBeenCalledWith({}, importQueue, 42, VALID_PAYLOAD);
  });

  it('returns 404 IMPORT_NOT_FOUND for an unknown import id', async () => {
    mockConfirmImport.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/imports/999/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_PAYLOAD),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('IMPORT_NOT_FOUND');
  });

  it('returns 422 MISSING_REQUIRED_COLUMNS when the mapping fails the floor check', async () => {
    mockConfirmImport.mockRejectedValue(new MissingRequiredColumnsError(['exam_no']));
    const app = createApp();
    const res = await app.request('/api/imports/42/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_PAYLOAD),
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('MISSING_REQUIRED_COLUMNS');
  });

  it('returns 400 VALIDATION_ERROR for a malformed mapping (unknown canonical field)', async () => {
    const app = createApp();
    const res = await app.request('/api/imports/42/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapping: { NODOSS: 'not_a_real_field' }, examYear: 2024 }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mockConfirmImport).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR for an out-of-range exam year', async () => {
    const app = createApp();
    const res = await app.request('/api/imports/42/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapping: VALID_PAYLOAD.mapping, examYear: 1800 }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mockConfirmImport).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR for an empty mapping', async () => {
    const app = createApp();
    const res = await app.request('/api/imports/42/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapping: {}, examYear: 2024 }),
    });

    expect(res.status).toBe(400);
    expect(mockConfirmImport).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR for a non-numeric import id', async () => {
    const app = createApp();
    const res = await app.request('/api/imports/not-a-number/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_PAYLOAD),
    });

    expect(res.status).toBe(400);
    expect(mockConfirmImport).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// confirmImport service — real implementation, DB and queue mocked at the edge
// ---------------------------------------------------------------------------

// A stateful fake standing in for Drizzle's imports table: tracks the row's
// status so the conditional (id, status='pending') UPDATE behaves like
// Postgres would across repeat calls in the same test — this is what makes
// the duplicate-confirm test meaningful without a real database.
function makeFakeDb(initialStatus: 'pending' | 'processing' | 'completed' | 'failed') {
  let status: typeof initialStatus = initialStatus;
  const insertedAliases: Array<{ rawHeader: string; canonicalField: string }> = [];

  const db = {
    select: () => ({
      from: (table: unknown) => {
        if (table === importsTable) {
          return { where: () => ({ limit: () => Promise.resolve([{ id: 42, status }]) }) };
        }
        throw new Error('unexpected table in select');
      },
    }),
    update: (table: unknown) => {
      if (table !== importsTable) throw new Error('unexpected table in update');
      return {
        set: (values: { status?: typeof initialStatus }) => ({
          where: () => ({
            returning: () => {
              if (status !== 'pending') return Promise.resolve([]);
              status = values.status ?? status;
              return Promise.resolve([{ id: 42, status }]);
            },
          }),
        }),
      };
    },
    insert: (table: unknown) => {
      if (table !== columnAliases) throw new Error('unexpected table in insert');
      return {
        values: (v: { rawHeader: string; canonicalField: string }) => ({
          onConflictDoUpdate: () => {
            insertedAliases.push(v);
            return Promise.resolve();
          },
        }),
      };
    },
  };

  return { db, insertedAliases, getStatus: () => status };
}

describe('confirmImport service', () => {
  it('enqueues exactly one job and persists learned aliases on first confirm', async () => {
    const { confirmImport: realConfirmImport } = await vi.importActual<
      typeof import('../services/confirm.js')
    >('../services/confirm.js');

    const { db, insertedAliases } = makeFakeDb('pending');
    const queue = { add: vi.fn().mockResolvedValue(undefined) };

    const result = await realConfirmImport(
      db as never,
      queue as never,
      42,
      { mapping: { NODOSS: 'exam_no', NOMPL: 'name_fr' }, examYear: 2024 },
    );

    expect(result).toEqual({ status: 'processing' });
    expect(queue.add).toHaveBeenCalledOnce();
    expect(queue.add).toHaveBeenCalledWith(
      'process-import',
      { importId: 42, examYear: 2024, mapping: { NODOSS: 'exam_no', NOMPL: 'name_fr' } },
      expect.objectContaining({ jobId: 'import-42', attempts: 3 }),
    );
    expect(insertedAliases).toEqual([
      { rawHeader: 'NODOSS', canonicalField: 'exam_no' },
      { rawHeader: 'NOMPL', canonicalField: 'name_fr' },
    ]);
  });

  it('does not enqueue a duplicate job when the same import is confirmed twice', async () => {
    const { confirmImport: realConfirmImport } = await vi.importActual<
      typeof import('../services/confirm.js')
    >('../services/confirm.js');

    const { db } = makeFakeDb('pending');
    const queue = { add: vi.fn().mockResolvedValue(undefined) };
    const payload = { mapping: { NODOSS: 'exam_no' as const, NOMPL: 'name_fr' as const }, examYear: 2024 };

    const first = await realConfirmImport(db as never, queue as never, 42, payload);
    const second = await realConfirmImport(db as never, queue as never, 42, payload);

    expect(first).toEqual({ status: 'processing' });
    expect(second).toEqual({ status: 'processing' });
    expect(queue.add).toHaveBeenCalledOnce();
  });

  it('reports the current status without re-enqueuing for an already-completed import', async () => {
    const { confirmImport: realConfirmImport } = await vi.importActual<
      typeof import('../services/confirm.js')
    >('../services/confirm.js');

    const { db } = makeFakeDb('completed');
    const queue = { add: vi.fn() };

    const result = await realConfirmImport(
      db as never,
      queue as never,
      42,
      { mapping: { NODOSS: 'exam_no', NOMPL: 'name_fr' }, examYear: 2024 },
    );

    expect(result).toEqual({ status: 'completed' });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('returns null for an unknown import id without touching the queue', async () => {
    const { confirmImport: realConfirmImport } = await vi.importActual<
      typeof import('../services/confirm.js')
    >('../services/confirm.js');

    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
    };
    const queue = { add: vi.fn() };

    const result = await realConfirmImport(
      db as never,
      queue as never,
      999,
      { mapping: { NODOSS: 'exam_no' }, examYear: 2024 },
    );

    expect(result).toBeNull();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('throws MissingRequiredColumnsError and never enqueues when the mapping lacks exam_no', async () => {
    const { confirmImport: realConfirmImport, MissingRequiredColumnsError: RealError } =
      await vi.importActual<typeof import('../services/confirm.js')>('../services/confirm.js');

    const { db } = makeFakeDb('pending');
    const queue = { add: vi.fn() };

    await expect(
      realConfirmImport(db as never, queue as never, 42, { mapping: { NOMPL: 'name_fr' }, examYear: 2024 }),
    ).rejects.toBeInstanceOf(RealError);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('throws MissingRequiredColumnsError when the mapping has no name column', async () => {
    const { confirmImport: realConfirmImport, MissingRequiredColumnsError: RealError } =
      await vi.importActual<typeof import('../services/confirm.js')>('../services/confirm.js');

    const { db } = makeFakeDb('pending');
    const queue = { add: vi.fn() };

    await expect(
      realConfirmImport(db as never, queue as never, 42, { mapping: { NODOSS: 'exam_no' }, examYear: 2024 }),
    ).rejects.toBeInstanceOf(RealError);
    expect(queue.add).not.toHaveBeenCalled();
  });
});
