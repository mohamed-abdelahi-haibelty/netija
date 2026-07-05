import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { imports as importsTable } from '../db/schema.js';
import type { ImportStatusResult } from 'shared';

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

vi.mock('../services/importStatus.js', () => ({ getImportStatus: vi.fn() }));

import { auth } from '../lib/auth.js';
import { getImportStatus } from '../services/importStatus.js';

const mockGetSession = vi.mocked(auth.api.getSession);
const mockGetImportStatus = vi.mocked(getImportStatus);

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

describe('GET /api/imports/:id/status', () => {
  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/imports/42/status');
    expect(res.status).toBe(401);
    expect(mockGetImportStatus).not.toHaveBeenCalled();
  });

  it('returns 200 with the processing state and progress', async () => {
    const processing: ImportStatusResult = {
      originalFilename: 'bac_2024.xlsx',
      status: 'processing',
      examYear: 2024,
      progress: 40,
      summary: null,
      smokePassed: null,
      published: false,
      failureReason: null,
    };
    mockGetImportStatus.mockResolvedValue(processing);
    const app = createApp();
    const res = await app.request('/api/imports/42/status');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: ImportStatusResult };
    expect(body.data).toEqual(processing);
    expect(mockGetImportStatus).toHaveBeenCalledWith({}, 42);
  });

  it('returns 200 with the completed state, summary, and no failure reason', async () => {
    const completed: ImportStatusResult = {
      originalFilename: 'bac_2024.xlsx',
      status: 'completed',
      examYear: 2024,
      progress: 100,
      summary: { inserted: 4980, rejected: 20, duplicatesSkipped: 0 },
      smokePassed: null,
      published: false,
      failureReason: null,
    };
    mockGetImportStatus.mockResolvedValue(completed);
    const app = createApp();
    const res = await app.request('/api/imports/42/status');

    const body = (await res.json()) as { data: ImportStatusResult };
    expect(body.data.summary).toEqual({ inserted: 4980, rejected: 20, duplicatesSkipped: 0 });
  });

  it('returns 200 with the failed state and the recorded failure reason', async () => {
    const failed: ImportStatusResult = {
      originalFilename: 'bac_2021_bad.xlsx',
      status: 'failed',
      examYear: 2024,
      progress: null,
      summary: null,
      smokePassed: null,
      published: false,
      failureReason: 'Import failed after 3 attempts: unreadable file.',
    };
    mockGetImportStatus.mockResolvedValue(failed);
    const app = createApp();
    const res = await app.request('/api/imports/42/status');

    const body = (await res.json()) as { data: ImportStatusResult };
    expect(body.data.status).toBe('failed');
    expect(body.data.failureReason).toBe('Import failed after 3 attempts: unreadable file.');
  });

  it('returns 404 IMPORT_NOT_FOUND for an unknown import id', async () => {
    mockGetImportStatus.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/imports/999/status');

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('IMPORT_NOT_FOUND');
  });

  it('returns 400 VALIDATION_ERROR for a non-numeric import id', async () => {
    const app = createApp();
    const res = await app.request('/api/imports/not-a-number/status');
    expect(res.status).toBe(400);
    expect(mockGetImportStatus).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getImportStatus — real implementation, DB mocked at the edge
// ---------------------------------------------------------------------------

describe('getImportStatus service', () => {
  it('maps a completed row with a summary', async () => {
    const { getImportStatus: realFn } = await vi.importActual<
      typeof import('../services/importStatus.js')
    >('../services/importStatus.js');

    const row = {
      originalFilename: 'bac_2024.xlsx',
      status: 'completed' as const,
      examYear: 2024,
      progress: 100,
      summaryInserted: 4980,
      summaryRejected: 20,
      summaryDuplicatesSkipped: 0,
      smokePassed: true,
      published: false,
      failureReason: null,
    };
    const db = {
      select: () => ({
        from: (table: unknown) => {
          if (table !== importsTable) throw new Error('unexpected table');
          return { where: () => ({ limit: () => Promise.resolve([row]) }) };
        },
      }),
    };

    const result = await realFn(db as never, 42);
    expect(result).toEqual({
      originalFilename: 'bac_2024.xlsx',
      status: 'completed',
      examYear: 2024,
      progress: 100,
      summary: { inserted: 4980, rejected: 20, duplicatesSkipped: 0 },
      smokePassed: true,
      published: false,
      failureReason: null,
    });
  });

  it('returns a null summary before the job has produced one', async () => {
    const { getImportStatus: realFn } = await vi.importActual<
      typeof import('../services/importStatus.js')
    >('../services/importStatus.js');

    const row = {
      originalFilename: 'bac_2025_raw.xlsx',
      status: 'pending' as const,
      examYear: null,
      progress: null,
      summaryInserted: null,
      summaryRejected: null,
      summaryDuplicatesSkipped: null,
      smokePassed: null,
      published: false,
      failureReason: null,
    };
    const db = {
      select: () => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([row]) }) }),
      }),
    };

    const result = await realFn(db as never, 1);
    expect(result?.summary).toBeNull();
  });

  it('returns null for an unknown import id', async () => {
    const { getImportStatus: realFn } = await vi.importActual<
      typeof import('../services/importStatus.js')
    >('../services/importStatus.js');

    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
    };

    const result = await realFn(db as never, 999);
    expect(result).toBeNull();
  });
});
