import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  importQueue: { getJob: vi.fn() },
  IMPORT_JOB_ATTEMPTS: 3,
  IMPORT_JOB_BACKOFF_MS: 2000,
}));

// Real ImportNotCancellableError class (so `err instanceof` in the route
// works) with the service function itself mocked at the boundary.
vi.mock('../services/cancelImport.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/cancelImport.js')>();
  return { ...actual, cancelImport: vi.fn() };
});

import { auth } from '../lib/auth.js';
import { importQueue } from '../lib/queue.js';
import { cancelImport, ImportNotCancellableError, FORCE_KILL_GRACE_MS } from '../services/cancelImport.js';

const mockGetSession = vi.mocked(auth.api.getSession);
const mockCancelImport = vi.mocked(cancelImport);

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
// POST /api/imports/:id/cancel — route contract, service mocked at the edge
// ---------------------------------------------------------------------------

describe('POST /api/imports/:id/cancel', () => {
  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/imports/42/cancel', { method: 'POST' });
    expect(res.status).toBe(401);
    expect(mockCancelImport).not.toHaveBeenCalled();
  });

  it('returns 200 with status cancelling when an active run is being stopped', async () => {
    mockCancelImport.mockResolvedValue({ status: 'cancelling' });
    const app = createApp();
    const res = await app.request('/api/imports/42/cancel', { method: 'POST' });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { status: string } };
    expect(body.data).toEqual({ status: 'cancelling' });
    expect(mockCancelImport).toHaveBeenCalledWith({}, importQueue, 42);
  });

  it('returns 200 with status cancelled when the job never actually started', async () => {
    mockCancelImport.mockResolvedValue({ status: 'cancelled' });
    const app = createApp();
    const res = await app.request('/api/imports/42/cancel', { method: 'POST' });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { status: string } };
    expect(body.data).toEqual({ status: 'cancelled' });
  });

  it('returns 404 IMPORT_NOT_FOUND for an unknown import id', async () => {
    mockCancelImport.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/imports/999/cancel', { method: 'POST' });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('IMPORT_NOT_FOUND');
  });

  it('returns 409 IMPORT_NOT_CANCELLABLE when the import is not currently processing', async () => {
    mockCancelImport.mockRejectedValue(new ImportNotCancellableError());
    const app = createApp();
    const res = await app.request('/api/imports/42/cancel', { method: 'POST' });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('IMPORT_NOT_CANCELLABLE');
  });

  it('returns 400 VALIDATION_ERROR for a non-numeric import id', async () => {
    const app = createApp();
    const res = await app.request('/api/imports/not-a-number/cancel', { method: 'POST' });
    expect(res.status).toBe(400);
    expect(mockCancelImport).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// cancelImport service — real implementation against fake db/queue chains
// ---------------------------------------------------------------------------

// A stateful fake standing in for Drizzle's imports table. Distinguishes
// which `select` is being made by the requested field shape — cancelImport.ts
// makes three different ones: {id, status} (existence + claim precondition),
// {workerPid} (after claiming, to decide whether to signal a process), and
// {status, workerPid} (the force-kill escalation's re-check).
function makeFakeDb(initialStatus: string | null, initialWorkerPid: number | null = null) {
  let status = initialStatus;
  let workerPid = initialWorkerPid;
  const updates: Array<Record<string, unknown>> = [];

  const db = {
    select: (fields: Record<string, unknown>) => ({
      from: (table: unknown) => {
        if (table !== importsTable) throw new Error('unexpected table in select');
        return {
          where: () => ({
            limit: () => {
              if ('workerPid' in fields && 'status' in fields) {
                return Promise.resolve(status === null ? [] : [{ status, workerPid }]);
              }
              if ('workerPid' in fields) {
                return Promise.resolve(status === null ? [] : [{ workerPid }]);
              }
              return Promise.resolve(status === null ? [] : [{ id: 42, status }]);
            },
          }),
        };
      },
    }),
    update: (table: unknown) => {
      if (table !== importsTable) throw new Error('unexpected table in update');
      return {
        set: (values: Record<string, unknown>) => {
          updates.push(values);
          const wasProcessing = status === 'processing';
          if (typeof values['status'] === 'string') status = values['status'];
          return {
            where: () => ({
              returning: () =>
                Promise.resolve(
                  values['status'] === 'cancelling' ? (wasProcessing ? [{ id: 42 }] : []) : [{ id: 42 }],
                ),
            }),
          };
        },
      };
    },
  };
  return {
    db,
    updates,
    getStatus: () => status,
    // Simulates importJob.ts finalizing the row out of band (e.g. the
    // loader's cooperative cancellation check stopped it before the
    // force-kill escalation timer fires) — something no method on `db`
    // itself does, since that's a different process in reality.
    setState: (nextStatus: string, nextWorkerPid: number | null) => {
      status = nextStatus;
      workerPid = nextWorkerPid;
    },
  };
}

function makeFakeQueue(job: { isActive: () => Promise<boolean>; remove: () => Promise<void> } | undefined) {
  return { getJob: vi.fn().mockResolvedValue(job) };
}

describe('cancelImport service', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns null for an unknown import id', async () => {
    const { cancelImport: realFn } = await vi.importActual<typeof import('../services/cancelImport.js')>(
      '../services/cancelImport.js',
    );
    const { db } = makeFakeDb(null);

    const result = await realFn(db as never, makeFakeQueue(undefined) as never, 999);
    expect(result).toBeNull();
  });

  it('throws ImportNotCancellableError when the import is not currently processing', async () => {
    const { cancelImport: realFn, ImportNotCancellableError: RealError } = await vi.importActual<
      typeof import('../services/cancelImport.js')
    >('../services/cancelImport.js');
    const { db } = makeFakeDb('completed');

    await expect(realFn(db as never, makeFakeQueue(undefined) as never, 42)).rejects.toBeInstanceOf(
      RealError,
    );
  });

  it('finalizes immediately to cancelled when the job never started (still waiting/delayed)', async () => {
    const { cancelImport: realFn } = await vi.importActual<typeof import('../services/cancelImport.js')>(
      '../services/cancelImport.js',
    );
    const { db, getStatus } = makeFakeDb('processing');
    const remove = vi.fn().mockResolvedValue(undefined);
    const queue = makeFakeQueue({ isActive: () => Promise.resolve(false), remove });

    const result = await realFn(db as never, queue as never, 42);

    expect(result).toEqual({ status: 'cancelled' });
    expect(remove).toHaveBeenCalledOnce();
    expect(getStatus()).toBe('cancelled');
  });

  it('finalizes immediately to cancelled when the job is already gone entirely', async () => {
    const { cancelImport: realFn } = await vi.importActual<typeof import('../services/cancelImport.js')>(
      '../services/cancelImport.js',
    );
    const { db, getStatus } = makeFakeDb('processing');

    const result = await realFn(db as never, makeFakeQueue(undefined) as never, 42);

    expect(result).toEqual({ status: 'cancelled' });
    expect(getStatus()).toBe('cancelled');
  });

  it('flips to cancelling and signals SIGTERM when the job is actively running with a known pid', async () => {
    const { cancelImport: realFn } = await vi.importActual<typeof import('../services/cancelImport.js')>(
      '../services/cancelImport.js',
    );
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const { db, getStatus } = makeFakeDb('processing', 4321);
    const queue = makeFakeQueue({ isActive: () => Promise.resolve(true), remove: vi.fn() });

    const result = await realFn(db as never, queue as never, 42);

    expect(result).toEqual({ status: 'cancelling' });
    expect(getStatus()).toBe('cancelling');
    expect(killSpy).toHaveBeenCalledWith(4321, 'SIGTERM');
  });

  it('does not touch process.kill when the job is active but no pid has been recorded yet', async () => {
    const { cancelImport: realFn } = await vi.importActual<typeof import('../services/cancelImport.js')>(
      '../services/cancelImport.js',
    );
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const { db } = makeFakeDb('processing', null);
    const queue = makeFakeQueue({ isActive: () => Promise.resolve(true), remove: vi.fn() });

    const result = await realFn(db as never, queue as never, 42);

    expect(result).toEqual({ status: 'cancelling' });
    expect(killSpy).not.toHaveBeenCalled();
  });

  it('escalates to SIGKILL if still cancelling with the same pid after the grace period', async () => {
    vi.useFakeTimers();
    const { cancelImport: realFn } = await vi.importActual<typeof import('../services/cancelImport.js')>(
      '../services/cancelImport.js',
    );
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const { db } = makeFakeDb('processing', 4321);
    const queue = makeFakeQueue({ isActive: () => Promise.resolve(true), remove: vi.fn() });

    await realFn(db as never, queue as never, 42);
    expect(killSpy).toHaveBeenCalledWith(4321, 'SIGTERM');

    await vi.advanceTimersByTimeAsync(FORCE_KILL_GRACE_MS);

    expect(killSpy).toHaveBeenCalledWith(4321, 'SIGKILL');
  });

  it('does not escalate to SIGKILL once the run already finished cooperatively before the grace period elapses', async () => {
    vi.useFakeTimers();
    const { cancelImport: realFn } = await vi.importActual<typeof import('../services/cancelImport.js')>(
      '../services/cancelImport.js',
    );
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const { db, setState } = makeFakeDb('processing', 4321);
    const queue = makeFakeQueue({ isActive: () => Promise.resolve(true), remove: vi.fn() });

    await realFn(db as never, queue as never, 42);
    expect(killSpy).toHaveBeenCalledWith(4321, 'SIGTERM');
    killSpy.mockClear();

    // importJob.ts's own finalize (a different process in reality) moved
    // the row to 'cancelled' and cleared workerPid — the loader's
    // cooperative check stopped it before the force-kill escalation timer
    // ever fires.
    setState('cancelled', null);

    await vi.advanceTimersByTimeAsync(FORCE_KILL_GRACE_MS);

    expect(killSpy).not.toHaveBeenCalled();
  });

  it('does not escalate to SIGKILL if a later run reuses the same pid number before the grace period elapses', async () => {
    vi.useFakeTimers();
    const { cancelImport: realFn } = await vi.importActual<typeof import('../services/cancelImport.js')>(
      '../services/cancelImport.js',
    );
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const { db, setState } = makeFakeDb('processing', 4321);
    const queue = makeFakeQueue({ isActive: () => Promise.resolve(true), remove: vi.fn() });

    await realFn(db as never, queue as never, 42);
    killSpy.mockClear();

    // Still 'cancelling' at recheck time, but the pid on the row no longer
    // matches the one we signalled — never escalate against a DIFFERENT
    // process than the one cancellation actually targeted.
    setState('cancelling', 9999);

    await vi.advanceTimersByTimeAsync(FORCE_KILL_GRACE_MS);

    expect(killSpy).not.toHaveBeenCalled();
  });
});
