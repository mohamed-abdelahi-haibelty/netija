import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createApp } from '../app.js';
import { imports as importsTable, columnAliases } from '../db/schema.js';
import type { ImportPreviewResult } from 'shared';

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

vi.mock('../services/preview.js', () => ({
  previewImport: vi.fn(),
  getLearnedAliases: vi.fn(),
  UnsupportedFileTypeError: class UnsupportedFileTypeError extends Error {},
}));

import { auth } from '../lib/auth.js';
import { previewImport, UnsupportedFileTypeError } from '../services/preview.js';

const mockGetSession = vi.mocked(auth.api.getSession);
const mockPreviewImport = vi.mocked(previewImport);

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

const PREVIEW_RESULT: ImportPreviewResult = {
  columns: [
    {
      header: 'NODOSS',
      canonicalField: 'exam_no',
      status: 'mapped',
      ignoredCategory: null,
      samples: ['00123', '00456'],
    },
    {
      header: 'NNI',
      canonicalField: null,
      status: 'ignored',
      ignoredCategory: 'nni',
      samples: ['1234567890'],
    },
    {
      header: 'REGION_ADMIN',
      canonicalField: null,
      status: 'unrecognized',
      ignoredCategory: null,
      samples: ['NORD'],
    },
  ],
  missingRequired: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(VALID_SESSION);
});

// ---------------------------------------------------------------------------
// Route contract — service mocked at the boundary
// ---------------------------------------------------------------------------

describe('GET /api/imports/:id/preview', () => {
  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/imports/1/preview');
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHENTICATED');
    expect(mockPreviewImport).not.toHaveBeenCalled();
  });

  it('returns 200 with the preview payload for a known import', async () => {
    mockPreviewImport.mockResolvedValue(PREVIEW_RESULT);
    const app = createApp();
    const res = await app.request('/api/imports/42/preview');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: ImportPreviewResult };
    expect(body.data).toEqual(PREVIEW_RESULT);
    expect(mockPreviewImport).toHaveBeenCalledWith({}, 42);
  });

  it('reports NNI/birth columns as ignored (never unrecognized) in the response', async () => {
    mockPreviewImport.mockResolvedValue(PREVIEW_RESULT);
    const app = createApp();
    const res = await app.request('/api/imports/42/preview');
    const body = (await res.json()) as { data: ImportPreviewResult };

    const nni = body.data.columns.find((c) => c.header === 'NNI');
    expect(nni?.status).toBe('ignored');
    expect(nni?.ignoredCategory).toBe('nni');
  });

  it('flags a genuinely unknown header as unrecognized', async () => {
    mockPreviewImport.mockResolvedValue(PREVIEW_RESULT);
    const app = createApp();
    const res = await app.request('/api/imports/42/preview');
    const body = (await res.json()) as { data: ImportPreviewResult };

    const unknown = body.data.columns.find((c) => c.header === 'REGION_ADMIN');
    expect(unknown?.status).toBe('unrecognized');
  });

  it('reports a floor violation via missingRequired without erroring', async () => {
    mockPreviewImport.mockResolvedValue({ ...PREVIEW_RESULT, missingRequired: ['exam_no'] });
    const app = createApp();
    const res = await app.request('/api/imports/42/preview');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: ImportPreviewResult };
    expect(body.data.missingRequired).toEqual(['exam_no']);
  });

  it('returns 404 IMPORT_NOT_FOUND for an unknown import id', async () => {
    mockPreviewImport.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/imports/999/preview');

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('IMPORT_NOT_FOUND');
  });

  it('returns 400 VALIDATION_ERROR for a non-numeric import id', async () => {
    const app = createApp();
    const res = await app.request('/api/imports/not-a-number/preview');

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mockPreviewImport).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR for a negative import id', async () => {
    const app = createApp();
    const res = await app.request('/api/imports/-1/preview');
    expect(res.status).toBe(400);
  });

  it('returns 500 INTERNAL, not a crash, for a truly unexpected preview failure', async () => {
    mockPreviewImport.mockRejectedValue(new Error('Mapping preview failed: corrupt file'));
    const app = createApp();
    const res = await app.request('/api/imports/42/preview');

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL');
    expect(body.error.message).not.toContain('corrupt file');
  });

  it('returns 415 UNSUPPORTED_FILE_TYPE, not a generic 500, when the file cannot be read', async () => {
    mockPreviewImport.mockRejectedValue(
      new UnsupportedFileTypeError("Missing optional dependency 'xlrd'."),
    );
    const app = createApp();
    const res = await app.request('/api/imports/42/preview');

    expect(res.status).toBe(415);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    // The raw Python/library exception text is never sent to the client.
    expect(body.error.message).not.toContain('xlrd');
  });
});

// ---------------------------------------------------------------------------
// previewImport — real implementation against real historical fixtures.
// Proves the API layer genuinely delegates to worker/preview.py (which
// delegates to worker/mapping.py) rather than reimplementing header
// recognition, and that the wiring produces correct output end to end.
//
// Requires a working Python interpreter with pandas/openpyxl (worker/.venv
// per worker/README.md); CI provisions the same venv to run `pytest` for
// worker/, so it's available here too.
// ---------------------------------------------------------------------------

const FIXTURES_DIR = resolve(process.cwd(), '../worker/tests/fixtures');
const VENV_PYTHON = resolve(process.cwd(), '../worker/.venv/bin/python');

beforeAll(() => {
  if (existsSync(VENV_PYTHON)) {
    process.env['PYTHON_BIN'] = VENV_PYTHON;
  }
});

// Builds a small throwaway .xlsx via the same Python interpreter preview.py
// itself runs under (openpyxl is already a worker/ dependency) — avoids
// adding a JS xlsx-writing library just for test fixtures.
function writeTempWorkbook(name: string, rows: string[][]): string {
  const dir = mkdtempSync(join(tmpdir(), `netija-preview-${name}-`));
  const filePath = join(dir, `${name}.xlsx`);
  const script = [
    'import openpyxl, json, sys',
    'wb = openpyxl.Workbook()',
    'ws = wb.active',
    'for row in json.loads(sys.argv[2]):',
    '    ws.append(row)',
    'wb.save(sys.argv[1])',
  ].join('\n');
  execFileSync(process.env['PYTHON_BIN'] ?? 'python3', ['-c', script, filePath, JSON.stringify(rows)]);
  return filePath;
}

function assertFound<T>(value: T | null): asserts value is T {
  expect(value).not.toBeNull();
}

function makeFixtureDb(filePath: string) {
  return {
    select: () => ({
      from: (table: unknown) => {
        if (table === columnAliases) {
          return Promise.resolve([]);
        }
        if (table === importsTable) {
          return {
            where: () => ({
              limit: () => Promise.resolve([{ filePath }]),
            }),
          };
        }
        throw new Error('unexpected table in preview fixture test');
      },
    }),
  };
}

describe('previewImport service — real fixtures (worker/preview.py wiring)', () => {
  it.each([
    ['2024', 'NODOSS'],
    ['2022', 'Num Bac'],
    ['future_minimal', 'N° Bac'],
  ])('previews %s.xlsx with the correct auto-mapping', async (fixture, examNoHeader) => {
    const { previewImport: realPreviewImport } = await vi.importActual<
      typeof import('../services/preview.js')
    >('../services/preview.js');

    const mockDb = makeFixtureDb(resolve(FIXTURES_DIR, `${fixture}.xlsx`));
    const result = await realPreviewImport(mockDb as never, 1);

    assertFound(result);
    expect(result.missingRequired).toEqual([]);
    const examCol = result.columns.find((c) => c.header === examNoHeader);
    expect(examCol?.status).toBe('mapped');
    expect(examCol?.canonicalField).toBe('exam_no');
    expect(examCol?.samples.length).toBeGreaterThan(0);
  });

  it('reports NNI and birth-place/date columns as ignored — not stored, for the 2024 fixture', async () => {
    const { previewImport: realPreviewImport } = await vi.importActual<
      typeof import('../services/preview.js')
    >('../services/preview.js');

    const mockDb = makeFixtureDb(resolve(FIXTURES_DIR, '2024.xlsx'));
    const result = await realPreviewImport(mockDb as never, 1);

    assertFound(result);
    const nni = result.columns.find((c) => c.header === 'NNI');
    expect(nni?.status).toBe('ignored');
    expect(nni?.ignoredCategory).toBe('nni');

    const birthDate = result.columns.find((c) => c.header === 'DATN');
    expect(birthDate?.status).toBe('ignored');
    expect(birthDate?.ignoredCategory).toBe('birth_date');

    const birthPlace = result.columns.find((c) => c.header === 'LIEUN');
    expect(birthPlace?.status).toBe('ignored');
    expect(birthPlace?.ignoredCategory).toBe('birth_place');

    expect(result.columns.filter((c) => c.status === 'unrecognized')).toEqual([]);
  });

  // preview.py's own tests (worker/tests/test_preview.py) prove full-file
  // parsing is avoided both by mocking pandas' nrows argument and by timing
  // a real 50k-row file — that proof belongs at the Python boundary where
  // the pandas call actually happens, not duplicated here.

  it('honors a learned alias override on a header the builtin dictionary does not know', async () => {
    // column_aliases winning over "unrecognized" is what lets an admin's
    // manual remap (task 019) silently auto-map on the next preview.
    const filePath = writeTempWorkbook('alias', [
      ['NODOSS', 'NOMPL', 'REGION_ADMIN'],
      ['00123', 'Ahmed Ould Mohamed', 'NORD'],
    ]);

    const mockDb = {
      select: () => ({
        from: (table: unknown) => {
          if (table === columnAliases) {
            return Promise.resolve([{ rawHeader: 'REGION_ADMIN', canonicalField: 'serie' }]);
          }
          if (table === importsTable) {
            return { where: () => ({ limit: () => Promise.resolve([{ filePath }]) }) };
          }
          throw new Error('unexpected table in preview fixture test');
        },
      }),
    };

    const { previewImport: realPreviewImport } = await vi.importActual<
      typeof import('../services/preview.js')
    >('../services/preview.js');

    const result = await realPreviewImport(mockDb as never, 1);

    assertFound(result);
    const regionCol = result.columns.find((c) => c.header === 'REGION_ADMIN');
    expect(regionCol?.status).toBe('mapped');
    expect(regionCol?.canonicalField).toBe('serie');
  });
});
