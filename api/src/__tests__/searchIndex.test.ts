import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import type { SearchIndexStatusResult, SearchIndexDocumentsResult } from 'shared';

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

vi.mock('../services/searchIndexAdmin.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/searchIndexAdmin.js')>();
  return {
    ...actual,
    getSearchIndexStatus: vi.fn(),
    listSearchIndexDocuments: vi.fn(),
    reindexSearchIndex: vi.fn(),
  };
});

import { auth } from '../lib/auth.js';
import {
  getSearchIndexStatus,
  listSearchIndexDocuments,
  reindexSearchIndex,
} from '../services/searchIndexAdmin.js';

const mockGetSession = vi.mocked(auth.api.getSession);
const mockGetSearchIndexStatus = vi.mocked(getSearchIndexStatus);
const mockListSearchIndexDocuments = vi.mocked(listSearchIndexDocuments);
const mockReindexSearchIndex = vi.mocked(reindexSearchIndex);

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
// GET /api/search-index/status — route contract, service mocked at the edge
// ---------------------------------------------------------------------------

describe('GET /api/search-index/status', () => {
  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/search-index/status');
    expect(res.status).toBe(401);
    expect(mockGetSearchIndexStatus).not.toHaveBeenCalled();
  });

  it('returns 200 with the index status', async () => {
    const status: SearchIndexStatusResult = {
      documentCount: 1234,
      isIndexing: false,
      healthy: true,
      searchableAttributes: ['nameFr', 'nameAr'],
      sortableAttributes: ['examYear'],
      filterableAttributes: ['importId', 'examYear'],
    };
    mockGetSearchIndexStatus.mockResolvedValue(status);
    const app = createApp();
    const res = await app.request('/api/search-index/status');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: SearchIndexStatusResult };
    expect(body.data).toEqual(status);
  });
});

// ---------------------------------------------------------------------------
// GET /api/search-index/documents — route contract, service mocked at the edge
// ---------------------------------------------------------------------------

describe('GET /api/search-index/documents', () => {
  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/search-index/documents');
    expect(res.status).toBe(401);
    expect(mockListSearchIndexDocuments).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when both importId and q are given', async () => {
    const app = createApp();
    const res = await app.request('/api/search-index/documents?importId=42&q=ahmed');
    expect(res.status).toBe(400);
    expect(mockListSearchIndexDocuments).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR for a non-numeric importId', async () => {
    const app = createApp();
    const res = await app.request('/api/search-index/documents?importId=abc');
    expect(res.status).toBe(400);
    expect(mockListSearchIndexDocuments).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR for an out-of-range pageSize', async () => {
    const app = createApp();
    const res = await app.request('/api/search-index/documents?pageSize=99999');
    expect(res.status).toBe(400);
    expect(mockListSearchIndexDocuments).not.toHaveBeenCalled();
  });

  it('returns 404 IMPORT_NOT_FOUND for an unknown importId', async () => {
    mockListSearchIndexDocuments.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/search-index/documents?importId=999');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('IMPORT_NOT_FOUND');
  });

  it('defaults page/pageSize and returns the page payload, unfiltered', async () => {
    const result: SearchIndexDocumentsResult = {
      documents: [
        { slug: 's1', importId: 1, examYear: 2024, examNo: '00001', nameFr: 'Ahmed', nameAr: null, serie: 'SN' },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    };
    mockListSearchIndexDocuments.mockResolvedValue(result);
    const app = createApp();
    const res = await app.request('/api/search-index/documents');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: SearchIndexDocumentsResult };
    expect(body.data).toEqual(result);
    expect(mockListSearchIndexDocuments).toHaveBeenCalledWith(
      {},
      {},
      expect.objectContaining({ page: 1, pageSize: 20 }),
    );
  });

  it('forwards importId, page, and pageSize to the service', async () => {
    mockListSearchIndexDocuments.mockResolvedValue({ documents: [], total: 0, page: 2, pageSize: 10 });
    const app = createApp();
    const res = await app.request('/api/search-index/documents?importId=42&page=2&pageSize=10');

    expect(res.status).toBe(200);
    expect(mockListSearchIndexDocuments).toHaveBeenCalledWith(
      {},
      {},
      expect.objectContaining({ importId: 42, page: 2, pageSize: 10 }),
    );
  });

  it('forwards q to the service', async () => {
    mockListSearchIndexDocuments.mockResolvedValue({ documents: [], total: 0, page: 1, pageSize: 20 });
    const app = createApp();
    const res = await app.request('/api/search-index/documents?q=Ahmed');

    expect(res.status).toBe(200);
    expect(mockListSearchIndexDocuments).toHaveBeenCalledWith(
      {},
      {},
      expect.objectContaining({ q: 'Ahmed' }),
    );
  });
});

// ---------------------------------------------------------------------------
// POST /api/search-index/reindex — route contract, service mocked at the edge
// ---------------------------------------------------------------------------

describe('POST /api/search-index/reindex', () => {
  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/search-index/reindex', { method: 'POST' });
    expect(res.status).toBe(401);
    expect(mockReindexSearchIndex).not.toHaveBeenCalled();
  });

  it('returns 200 with the rebuilt document count', async () => {
    mockReindexSearchIndex.mockResolvedValue({ documentCount: 456 });
    const app = createApp();
    const res = await app.request('/api/search-index/reindex', { method: 'POST' });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { documentCount: number } };
    expect(body.data).toEqual({ documentCount: 456 });
    expect(mockReindexSearchIndex).toHaveBeenCalledWith({}, {});
  });
});

// ---------------------------------------------------------------------------
// searchIndexAdmin service — real implementation, DB/Meilisearch mocked at
// the edge
// ---------------------------------------------------------------------------

function makeChain(response: unknown) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  return chain;
}

describe('getSearchIndexStatus service', () => {
  it('reports document count, indexing state, settings, and health', async () => {
    const { getSearchIndexStatus: realFn } = await vi.importActual<
      typeof import('../services/searchIndexAdmin.js')
    >('../services/searchIndexAdmin.js');

    const meili = {
      index: () => ({
        getStats: vi.fn().mockResolvedValue({ numberOfDocuments: 10, isIndexing: false }),
        getSettings: vi.fn().mockResolvedValue({
          searchableAttributes: ['nameFr', 'nameAr'],
          sortableAttributes: ['examYear'],
          filterableAttributes: ['importId', 'examYear'],
        }),
      }),
      health: vi.fn().mockResolvedValue({ status: 'available' }),
    };

    const result = await realFn(meili as never);
    expect(result).toEqual({
      documentCount: 10,
      isIndexing: false,
      healthy: true,
      searchableAttributes: ['nameFr', 'nameAr'],
      sortableAttributes: ['examYear'],
      filterableAttributes: ['importId', 'examYear'],
    });
  });

  it('reports healthy: false when Meilisearch is unreachable', async () => {
    const { getSearchIndexStatus: realFn } = await vi.importActual<
      typeof import('../services/searchIndexAdmin.js')
    >('../services/searchIndexAdmin.js');

    const meili = {
      index: () => ({
        getStats: vi.fn().mockResolvedValue({ numberOfDocuments: 0, isIndexing: false }),
        getSettings: vi.fn().mockResolvedValue({}),
      }),
      health: vi.fn().mockRejectedValue(new Error('connection refused')),
    };

    const result = await realFn(meili as never);
    expect(result.healthy).toBe(false);
  });
});

describe('listSearchIndexDocuments service', () => {
  it('returns null for an unknown importId', async () => {
    const { listSearchIndexDocuments: realFn } = await vi.importActual<
      typeof import('../services/searchIndexAdmin.js')
    >('../services/searchIndexAdmin.js');

    const db = { select: () => makeChain([]) };
    const meili = { index: () => ({ getDocuments: vi.fn() }) };

    const result = await realFn(db as never, meili as never, { importId: 999, page: 1, pageSize: 20 });
    expect(result).toBeNull();
  });

  it('filters by importId once the import is confirmed to exist', async () => {
    const { listSearchIndexDocuments: realFn } = await vi.importActual<
      typeof import('../services/searchIndexAdmin.js')
    >('../services/searchIndexAdmin.js');

    const doc = { id: 'slug1', importId: 42, examYear: 2024, examNo: '00001', nameFr: 'Ahmed', nameAr: null, serie: 'SN' };
    const getDocuments = vi.fn().mockResolvedValue({ results: [doc], total: 1, offset: 0, limit: 20 });
    const db = { select: () => makeChain([{ id: 42 }]) };
    const meili = { index: () => ({ getDocuments }) };

    const result = await realFn(db as never, meili as never, { importId: 42, page: 1, pageSize: 20 });

    expect(result).toEqual({
      documents: [{ slug: 'slug1', importId: 42, examYear: 2024, examNo: '00001', nameFr: 'Ahmed', nameAr: null, serie: 'SN' }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(getDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ filter: 'importId = 42', limit: 20, offset: 0 }),
    );
  });

  it('runs a free-text search when q is given, without touching the DB', async () => {
    const { listSearchIndexDocuments: realFn } = await vi.importActual<
      typeof import('../services/searchIndexAdmin.js')
    >('../services/searchIndexAdmin.js');

    const hit = { id: 'slug2', importId: 7, examYear: 2023, examNo: '00002', nameFr: 'Fatima', nameAr: null, serie: 'LM' };
    const search = vi.fn().mockResolvedValue({ hits: [hit], estimatedTotalHits: 1 });
    const dbSelect = vi.fn();
    const db = { select: dbSelect };
    const meili = { index: () => ({ search }) };

    const result = await realFn(db as never, meili as never, { q: 'Fatima', page: 1, pageSize: 20 });

    expect(result).toEqual({
      documents: [{ slug: 'slug2', importId: 7, examYear: 2023, examNo: '00002', nameFr: 'Fatima', nameAr: null, serie: 'LM' }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(search).toHaveBeenCalledWith('Fatima', { limit: 20, offset: 0 });
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it('browses the whole index, unfiltered, when neither importId nor q is given', async () => {
    const { listSearchIndexDocuments: realFn } = await vi.importActual<
      typeof import('../services/searchIndexAdmin.js')
    >('../services/searchIndexAdmin.js');

    const getDocuments = vi.fn().mockResolvedValue({ results: [], total: 0, offset: 0, limit: 20 });
    const meili = { index: () => ({ getDocuments }) };

    const result = await realFn({} as never, meili as never, { page: 1, pageSize: 20 });

    expect(result).toEqual({ documents: [], total: 0, page: 1, pageSize: 20 });
    expect(getDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ filter: undefined, limit: 20, offset: 0 }),
    );
  });
});

describe('reindexSearchIndex service', () => {
  it('rebuilds the index from Postgres and returns the document count', async () => {
    const { reindexSearchIndex: realFn } = await vi.importActual<
      typeof import('../services/searchIndexAdmin.js')
    >('../services/searchIndexAdmin.js');

    const db = { execute: vi.fn().mockResolvedValue({ rows: [] }) };
    const meili = {
      index: () => ({
        updateSettings: vi.fn().mockResolvedValue(undefined),
        deleteAllDocuments: vi.fn().mockResolvedValue(undefined),
        addDocuments: vi.fn().mockResolvedValue(undefined),
      }),
    };

    const result = await realFn(db as never, meili as never);
    expect(result).toEqual({ documentCount: 0 });
  });
});
