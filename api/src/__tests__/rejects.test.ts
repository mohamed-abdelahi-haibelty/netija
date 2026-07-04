import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import type { RejectReportRow } from '../services/rejects.js';

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

vi.mock('../services/rejects.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/rejects.js')>();
  return { ...actual, getRejectReport: vi.fn() };
});

import { auth } from '../lib/auth.js';
import { getRejectReport, toRejectReportCsv } from '../services/rejects.js';

const mockGetSession = vi.mocked(auth.api.getSession);
const mockGetRejectReport = vi.mocked(getRejectReport);

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

const REJECT_ROWS: RejectReportRow[] = [
  { rowNumber: 3, reason: 'missing serie', rawData: { NODOSS: '00003' } },
  { rowNumber: 7, reason: 'unrecognized decision variant: "Refuse"', rawData: { NODOSS: '00007' } },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(VALID_SESSION);
});

// ---------------------------------------------------------------------------
// Route contract — service mocked at the boundary
// ---------------------------------------------------------------------------

describe('GET /api/imports/:id/rejects', () => {
  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/imports/1/rejects');
    expect(res.status).toBe(401);
    expect(mockGetRejectReport).not.toHaveBeenCalled();
  });

  it('returns a downloadable CSV for a known import', async () => {
    mockGetRejectReport.mockResolvedValue(REJECT_ROWS);
    const app = createApp();
    const res = await app.request('/api/imports/42/rejects');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    expect(res.headers.get('Content-Disposition')).toContain('import-42-rejects.csv');
    const body = await res.text();
    expect(body).toBe(toRejectReportCsv(REJECT_ROWS));
    expect(body.split('\n')[0]).toBe('row_number,reason,raw_data');
    expect(mockGetRejectReport).toHaveBeenCalledWith({}, 42);
  });

  it('returns a header-only CSV for an import with zero rejects', async () => {
    mockGetRejectReport.mockResolvedValue([]);
    const app = createApp();
    const res = await app.request('/api/imports/42/rejects');

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe('row_number,reason,raw_data\n');
  });

  it('returns 404 IMPORT_NOT_FOUND for an unknown import id', async () => {
    mockGetRejectReport.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/imports/999/rejects');

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('IMPORT_NOT_FOUND');
  });

  it('returns 400 VALIDATION_ERROR for a non-numeric import id', async () => {
    const app = createApp();
    const res = await app.request('/api/imports/not-a-number/rejects');

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mockGetRejectReport).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// toRejectReportCsv — pure formatting
// ---------------------------------------------------------------------------

describe('toRejectReportCsv', () => {
  it('quotes a reason containing a comma or double quote', () => {
    const csv = toRejectReportCsv([
      { rowNumber: 1, reason: 'unrecognized decision variant: "Refuse, annulé"', rawData: {} },
    ]);
    const dataLine = csv.split('\n')[1];
    expect(dataLine).toBe('1,"unrecognized decision variant: ""Refuse, annulé""",{}');
  });
});

// ---------------------------------------------------------------------------
// getRejectReport service — real implementation against fake db chains
// ---------------------------------------------------------------------------

describe('getRejectReport service', () => {
  it('returns null for an unknown import id without querying rejects', async () => {
    const { getRejectReport: realGetRejectReport } =
      await vi.importActual<typeof import('../services/rejects.js')>('../services/rejects.js');

    let selectCalls = 0;
    const db = {
      select: () => {
        selectCalls += 1;
        // Only the imports-existence check is expected; a second call
        // would mean rejects got queried despite the import not existing.
        if (selectCalls > 1) throw new Error('unexpected second select() call');
        return { from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) };
      },
    };

    const result = await realGetRejectReport(db as never, 999);

    expect(result).toBeNull();
    expect(selectCalls).toBe(1);
  });

  it('maps db rows to the report shape for a known import', async () => {
    const { getRejectReport: realGetRejectReport } =
      await vi.importActual<typeof import('../services/rejects.js')>('../services/rejects.js');

    let call = 0;
    const db = {
      select: () => {
        call += 1;
        if (call === 1) {
          // imports existence check
          return { from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 42 }]) }) }) };
        }
        // rejects query
        return {
          from: () => ({
            where: () => ({
              orderBy: () =>
                Promise.resolve([
                  { rowNumber: 7, reason: 'unrecognized decision', rawData: { A: '1' } },
                  { rowNumber: 3, reason: 'missing serie', rawData: { A: '2' } },
                ]),
            }),
          }),
        };
      },
    };

    const result = await realGetRejectReport(db as never, 42);
    expect(result).toEqual([
      { rowNumber: 7, reason: 'unrecognized decision', rawData: { A: '1' } },
      { rowNumber: 3, reason: 'missing serie', rawData: { A: '2' } },
    ]);
  });
});
