import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { imports as importsTable } from '../db/schema.js';
import type { ImportListItem } from 'shared';

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

vi.mock('../services/importList.js', () => ({ listImports: vi.fn() }));

import { auth } from '../lib/auth.js';
import { listImports } from '../services/importList.js';

const mockGetSession = vi.mocked(auth.api.getSession);
const mockListImports = vi.mocked(listImports);

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

describe('GET /api/imports', () => {
  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/imports');
    expect(res.status).toBe(401);
    expect(mockListImports).not.toHaveBeenCalled();
  });

  it('returns 200 with an empty array when no imports exist', async () => {
    mockListImports.mockResolvedValue([]);
    const app = createApp();
    const res = await app.request('/api/imports');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: ImportListItem[] };
    expect(body.data).toEqual([]);
  });

  it('returns 200 with every import, newest first, covering the full lifecycle', async () => {
    const rows: ImportListItem[] = [
      {
        id: 3,
        originalFilename: 'bac_2024.xlsx',
        examType: 'bac',
        examYear: 2024,
        status: 'processing',
        progress: 40,
        summary: null,
        smokePassed: null,
        published: false,
        failureReason: null,
        createdAt: '2026-07-04T09:00:00.000Z',
      },
      {
        id: 2,
        originalFilename: 'bac_2023.xlsx',
        examType: 'bac',
        examYear: 2023,
        status: 'completed',
        progress: 100,
        summary: { inserted: 4980, rejected: 20, duplicatesSkipped: 0 },
        smokePassed: true,
        published: true,
        failureReason: null,
        createdAt: '2026-06-01T09:00:00.000Z',
      },
      {
        id: 1,
        originalFilename: 'bac_2021_bad.xlsx',
        examType: 'bac',
        examYear: null,
        status: 'failed',
        progress: null,
        summary: null,
        smokePassed: null,
        published: false,
        failureReason: 'MISSING_REQUIRED_COLUMNS',
        createdAt: '2025-09-10T09:00:00.000Z',
      },
    ];
    mockListImports.mockResolvedValue(rows);
    const app = createApp();
    const res = await app.request('/api/imports');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: ImportListItem[] };
    expect(body.data).toEqual(rows);
    expect(mockListImports).toHaveBeenCalledWith({});
  });
});

// ---------------------------------------------------------------------------
// listImports — real implementation, DB mocked at the edge
// ---------------------------------------------------------------------------

describe('listImports service', () => {
  it('maps rows and orders newest-created-first', async () => {
    const { listImports: realFn } = await vi.importActual<
      typeof import('../services/importList.js')
    >('../services/importList.js');

    const dbRows = [
      {
        id: 2,
        originalFilename: 'bac_2024.xlsx',
        examType: 'bac',
        examYear: 2024,
        status: 'completed' as const,
        progress: 100,
        summaryInserted: 100,
        summaryRejected: 5,
        summaryDuplicatesSkipped: 1,
        smokePassed: true,
        published: false,
        failureReason: null,
        createdAt: new Date('2026-07-04T09:00:00.000Z'),
      },
      {
        id: 1,
        originalFilename: 'bac_2023.xlsx',
        examType: 'bac',
        examYear: 2023,
        status: 'pending' as const,
        progress: null,
        summaryInserted: null,
        summaryRejected: null,
        summaryDuplicatesSkipped: null,
        smokePassed: null,
        published: false,
        failureReason: null,
        createdAt: new Date('2026-07-01T09:00:00.000Z'),
      },
    ];

    let orderByArg: unknown;
    const db = {
      select: () => ({
        from: (table: unknown) => {
          if (table !== importsTable) throw new Error('unexpected table');
          return {
            orderBy: (arg: unknown) => {
              orderByArg = arg;
              return Promise.resolve(dbRows);
            },
          };
        },
      }),
    };

    const result = await realFn(db as never);
    expect(orderByArg).toBeDefined();
    expect(result).toEqual([
      {
        id: 2,
        originalFilename: 'bac_2024.xlsx',
        examType: 'bac',
        examYear: 2024,
        status: 'completed',
        progress: 100,
        summary: { inserted: 100, rejected: 5, duplicatesSkipped: 1 },
        smokePassed: true,
        published: false,
        failureReason: null,
        createdAt: '2026-07-04T09:00:00.000Z',
      },
      {
        id: 1,
        originalFilename: 'bac_2023.xlsx',
        examType: 'bac',
        examYear: 2023,
        status: 'pending',
        progress: null,
        summary: null,
        smokePassed: null,
        published: false,
        failureReason: null,
        createdAt: '2026-07-01T09:00:00.000Z',
      },
    ]);
  });

  it('returns an empty array when there are no imports', async () => {
    const { listImports: realFn } = await vi.importActual<
      typeof import('../services/importList.js')
    >('../services/importList.js');

    const db = {
      select: () => ({ from: () => ({ orderBy: () => Promise.resolve([]) }) }),
    };

    const result = await realFn(db as never);
    expect(result).toEqual([]);
  });
});
