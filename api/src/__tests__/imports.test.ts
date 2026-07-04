import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app.js';

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

// Keep sniffExcelType real (it's the behavior under test); stub the disk and
// DB edges so the route tests don't touch the filesystem or Postgres.
vi.mock('../services/imports.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/imports.js')>();
  return {
    ...actual,
    saveUploadedFile: vi.fn(),
    createImport: vi.fn(),
  };
});

import { auth } from '../lib/auth.js';
import { saveUploadedFile, createImport } from '../services/imports.js';

const mockGetSession = vi.mocked(auth.api.getSession);
const mockSaveUploadedFile = vi.mocked(saveUploadedFile);
const mockCreateImport = vi.mocked(createImport);

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

// Real (small) file signatures — the route sniffs actual bytes, not the
// filename or the FormData Blob's declared type.
const XLSX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
const XLS_BYTES = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]);
// A renamed executable: real Windows PE binaries start with "MZ", not a
// spreadsheet signature — proves detection reads content, not the extension.
const EXE_BYTES = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

function makeForm(entries: Array<[string, Blob, string]>): FormData {
  const form = new FormData();
  for (const [key, blob, filename] of entries) {
    form.append(key, blob, filename);
  }
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(VALID_SESSION);
  mockSaveUploadedFile.mockResolvedValue('/uploads/generated-id.xlsx');
  mockCreateImport.mockResolvedValue({ id: 42 });
});

describe('POST /api/imports', () => {
  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = createApp();
    const form = makeForm([['file', new Blob([XLSX_BYTES]), 'results.xlsx']]);
    const res = await app.request('/api/imports', { method: 'POST', body: form });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHENTICATED');
    expect(mockCreateImport).not.toHaveBeenCalled();
  });

  it('accepts a valid .xlsx upload and returns 201 with the import id', async () => {
    const app = createApp();
    const form = makeForm([['file', new Blob([XLSX_BYTES]), 'results.xlsx']]);
    const res = await app.request('/api/imports', { method: 'POST', body: form });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { importId: number } };
    expect(body.data.importId).toBe(42);

    expect(mockSaveUploadedFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Buffer),
      'xlsx',
    );
    expect(mockCreateImport).toHaveBeenCalledWith(
      {},
      { originalFilename: 'results.xlsx', filePath: '/uploads/generated-id.xlsx' },
    );
  });

  it('accepts a valid legacy .xls upload and returns 201', async () => {
    const app = createApp();
    const form = makeForm([['file', new Blob([XLS_BYTES]), 'old-results.xls']]);
    const res = await app.request('/api/imports', { method: 'POST', body: form });

    expect(res.status).toBe(201);
    expect(mockSaveUploadedFile).toHaveBeenCalledWith(expect.any(String), expect.any(Buffer), 'xls');
  });

  it('returns 400 VALIDATION_ERROR when no file is provided', async () => {
    const app = createApp();
    const form = makeForm([]);
    const res = await app.request('/api/imports', { method: 'POST', body: form });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mockCreateImport).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when two files are uploaded in one request', async () => {
    const app = createApp();
    const form = makeForm([
      ['file', new Blob([XLSX_BYTES]), 'a.xlsx'],
      ['file', new Blob([XLSX_BYTES]), 'b.xlsx'],
    ]);
    const res = await app.request('/api/imports', { method: 'POST', body: form });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mockCreateImport).not.toHaveBeenCalled();
  });

  it('returns 415 UNSUPPORTED_FILE_TYPE for a renamed executable (content sniffing)', async () => {
    const app = createApp();
    // Claims to be .xlsx via extension and a spreadsheet MIME type, but its
    // bytes are a Windows executable — the sniff must reject it regardless.
    const form = makeForm([
      ['file', new Blob([EXE_BYTES], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'results.xlsx'],
    ]);
    const res = await app.request('/api/imports', { method: 'POST', body: form });

    expect(res.status).toBe(415);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(mockCreateImport).not.toHaveBeenCalled();
  });

  it('returns 413 FILE_TOO_LARGE for a file over 25 MB', async () => {
    const app = createApp();
    const oversized = new Uint8Array(25 * 1024 * 1024 + 1);
    oversized.set(XLSX_BYTES, 0);
    const form = makeForm([['file', new Blob([oversized]), 'huge.xlsx']]);
    const res = await app.request('/api/imports', { method: 'POST', body: form });

    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FILE_TOO_LARGE');
    expect(mockCreateImport).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// sniffExcelType — pure content-sniffing logic
// ---------------------------------------------------------------------------

describe('sniffExcelType', () => {
  it('identifies xlsx (zip / OOXML signature)', async () => {
    const { sniffExcelType } = await vi.importActual<typeof import('../services/imports.js')>(
      '../services/imports.js',
    );
    expect(sniffExcelType(XLSX_BYTES)).toBe('xlsx');
  });

  it('identifies xls (OLE2 compound file signature)', async () => {
    const { sniffExcelType } = await vi.importActual<typeof import('../services/imports.js')>(
      '../services/imports.js',
    );
    expect(sniffExcelType(XLS_BYTES)).toBe('xls');
  });

  it('rejects unrecognized content, including a renamed executable', async () => {
    const { sniffExcelType } = await vi.importActual<typeof import('../services/imports.js')>(
      '../services/imports.js',
    );
    expect(sniffExcelType(EXE_BYTES)).toBeNull();
    expect(sniffExcelType(new TextEncoder().encode('plain text file'))).toBeNull();
  });

  it('rejects a buffer shorter than any known signature', async () => {
    const { sniffExcelType } = await vi.importActual<typeof import('../services/imports.js')>(
      '../services/imports.js',
    );
    expect(sniffExcelType(new Uint8Array([0x50, 0x4b]))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// saveUploadedFile — real implementation, filesystem mocked at the edge
// ---------------------------------------------------------------------------

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

describe('saveUploadedFile', () => {
  it('creates the uploads dir and writes the file under a generated name', async () => {
    const fsPromises = await import('node:fs/promises');
    const { saveUploadedFile: realFn } = await vi.importActual<
      typeof import('../services/imports.js')
    >('../services/imports.js');

    const filePath = await realFn('/uploads', Buffer.from(XLSX_BYTES), 'xlsx');

    expect(vi.mocked(fsPromises.mkdir)).toHaveBeenCalledWith('/uploads', { recursive: true });
    expect(vi.mocked(fsPromises.writeFile)).toHaveBeenCalledWith(
      filePath,
      Buffer.from(XLSX_BYTES),
    );
    expect(filePath).toMatch(/^\/uploads\/[0-9a-f-]{36}\.xlsx$/);
  });
});

// ---------------------------------------------------------------------------
// createImport — real implementation, DB mocked at the edge
// ---------------------------------------------------------------------------

describe('createImport', () => {
  it('inserts a pending import row and returns its id', async () => {
    const { createImport: realFn } = await vi.importActual<
      typeof import('../services/imports.js')
    >('../services/imports.js');

    const returning = vi.fn().mockResolvedValue([{ id: 7 }]);
    const values = vi.fn(() => ({ returning }));
    const insert = vi.fn(() => ({ values }));
    const mockDb = { insert };

    const result = await realFn(mockDb as never, {
      originalFilename: 'results.xlsx',
      filePath: '/uploads/abc.xlsx',
    });

    expect(result).toEqual({ id: 7 });
    expect(values).toHaveBeenCalledWith({
      originalFilename: 'results.xlsx',
      filePath: '/uploads/abc.xlsx',
    });
  });
});
