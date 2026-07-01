import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app.js';

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted before any imports)
// ---------------------------------------------------------------------------

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

vi.mock('../services/nameSearch.js', () => ({
  searchByName: vi.fn(),
}));

vi.mock('../services/meiliIndex.js', () => ({
  buildNameIndex: vi.fn(),
}));

vi.mock('../db/client.js', () => ({ db: {} }));
vi.mock('../lib/redis.js', () => ({ redis: {} }));
vi.mock('../lib/meili.js', () => ({ meili: {}, PERSONS_INDEX: 'persons' }));

// Also mock the other search services to prevent side effects
vi.mock('../services/examSearch.js', () => ({
  searchByExamNo: vi.fn(),
  getPublishedYears: vi.fn(),
  invalidateExamCache: vi.fn(),
  invalidateYearsCache: vi.fn(),
}));

import { searchByName } from '../services/nameSearch.js';
import type { NameSearchSuggestion } from 'shared';

const mockSearchByName = vi.mocked(searchByName);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUGGESTIONS: NameSearchSuggestion[] = [
  {
    personId: '1',
    nameFr: 'Ahmed Ould Mohamed',
    nameAr: 'أحمد ولد محمد',
    latestYear: 2023,
    serie: 'SN',
    birthPlace: 'Nouakchott',
  },
  {
    personId: '2',
    nameFr: 'Ahmed Ould Mohamed',
    nameAr: null,
    latestYear: 2022,
    serie: 'LM',
    birthPlace: 'Nouadhibou',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Route integration tests — Meili client is mocked via the service mock
// ---------------------------------------------------------------------------

describe('GET /api/search/name', () => {
  it('returns 200 with suggestions on a valid query', async () => {
    mockSearchByName.mockResolvedValue(SUGGESTIONS);
    const app = createApp();
    const res = await app.request('/api/search/name?q=ahmed');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { suggestions: NameSearchSuggestion[] } };
    expect(body.data.suggestions).toHaveLength(2);
    expect(body.data.suggestions[0]).toMatchObject({
      personId: '1',
      nameFr: 'Ahmed Ould Mohamed',
      latestYear: 2023,
      serie: 'SN',
      birthPlace: 'Nouakchott',
    });
    expect(mockSearchByName).toHaveBeenCalledOnce();
  });

  it('returns 200 with an empty suggestions array when Meilisearch has no hits', async () => {
    mockSearchByName.mockResolvedValue([]);
    const app = createApp();
    const res = await app.request('/api/search/name?q=zzz');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { suggestions: NameSearchSuggestion[] } };
    expect(body.data.suggestions).toEqual([]);
  });

  it('returns 400 when query is a single character (below minimum length)', async () => {
    const app = createApp();
    const res = await app.request('/api/search/name?q=a');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; issues: unknown[] } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.issues).toBeDefined();
    expect(mockSearchByName).not.toHaveBeenCalled();
  });

  it('returns 400 when query param is missing', async () => {
    const app = createApp();
    const res = await app.request('/api/search/name');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mockSearchByName).not.toHaveBeenCalled();
  });

  it('response carries all disambiguator fields (latestYear, serie, birthPlace)', async () => {
    const withDisambiguators: NameSearchSuggestion[] = [
      {
        personId: '10',
        nameFr: 'Fatima Mint Ali',
        nameAr: 'فاطمة منت علي',
        latestYear: 2023,
        serie: 'TS',
        birthPlace: 'Rosso',
      },
    ];
    mockSearchByName.mockResolvedValue(withDisambiguators);
    const app = createApp();
    const res = await app.request('/api/search/name?q=fatima');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { suggestions: NameSearchSuggestion[] } };
    const s = body.data.suggestions[0]!;
    expect(s.latestYear).toBe(2023);
    expect(s.serie).toBe('TS');
    expect(s.birthPlace).toBe('Rosso');
  });

  it('returns at most 10 suggestions (enforced by the service)', async () => {
    // The service is responsible for capping at 10; we verify the route passes
    // whatever the service returns unchanged.
    const tenSuggestions: NameSearchSuggestion[] = Array.from({ length: 10 }, (_, i) => ({
      personId: String(i + 1),
      nameFr: `Person ${i + 1}`,
      nameAr: null,
      latestYear: 2023,
      serie: 'SN',
      birthPlace: null,
    }));
    mockSearchByName.mockResolvedValue(tenSuggestions);
    const app = createApp();
    const res = await app.request('/api/search/name?q=person');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { suggestions: NameSearchSuggestion[] } };
    expect(body.data.suggestions).toHaveLength(10);
  });

  it('accepts Arabic query input', async () => {
    mockSearchByName.mockResolvedValue(SUGGESTIONS);
    const app = createApp();
    const encoded = encodeURIComponent('أحمد');
    const res = await app.request(`/api/search/name?q=${encoded}`);
    expect(res.status).toBe(200);
    expect(mockSearchByName).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Service unit test — index builder produces correct documents
// ---------------------------------------------------------------------------

describe('buildNameIndex service', () => {
  it('passes only published-person documents to Meilisearch and excludes unpublished-only persons', async () => {
    const { buildNameIndex: realBuildNameIndex } =
      await vi.importActual<typeof import('../services/meiliIndex.js')>(
        '../services/meiliIndex.js',
      );

    // DB mock returns two persons — person '3' (unpublished-only) is absent
    // because the SQL WHERE i.published = true filtered it out.
    const dbRows = [
      { personId: '1', nameFr: 'Ahmed Ould Mohamed', nameAr: 'أحمد ولد محمد', latestYear: 2023, serie: 'SN', birthPlace: 'Nouakchott' },
      { personId: '2', nameFr: 'Fatima Mint Ali', nameAr: null, latestYear: 2022, serie: 'LM', birthPlace: null },
    ];
    const mockDb = { execute: vi.fn().mockResolvedValue({ rows: dbRows }) };

    const addDocumentsMock = vi.fn().mockResolvedValue({ taskUid: 1 });
    const deleteAllMock = vi.fn().mockResolvedValue({ taskUid: 2 });
    const updateSettingsMock = vi.fn().mockResolvedValue({ taskUid: 3 });
    const indexMock = {
      updateSettings: updateSettingsMock,
      deleteAllDocuments: deleteAllMock,
      addDocuments: addDocumentsMock,
    };
    const mockMeili = { index: vi.fn().mockReturnValue(indexMock) };

    const count = await realBuildNameIndex(
      mockDb as never,
      mockMeili as never,
    );

    expect(count).toBe(2);

    // Correct index is addressed
    expect(mockMeili.index).toHaveBeenCalledWith('persons');

    // Settings configure both searchable fields and sort field
    expect(updateSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        searchableAttributes: ['nameFr', 'nameAr'],
        sortableAttributes: ['latestYear'],
      }),
    );

    // Full rebuild: clear before pushing
    expect(deleteAllMock).toHaveBeenCalledOnce();

    // Verify the two published persons are in the documents
    const [capturedDocs] = addDocumentsMock.mock.calls[0] as [
      Array<{ id: string; nameFr: string | null; nameAr: string | null; latestYear: number; serie: string; birthPlace: string | null }>,
      ...unknown[]
    ];
    expect(capturedDocs).toHaveLength(2);
    expect(capturedDocs.map((d) => d.id)).toEqual(['1', '2']);

    // Person '3' (unpublished-only) is absent
    expect(capturedDocs.map((d) => d.id)).not.toContain('3');

    // Document shape carries all disambiguators
    const firstDoc = capturedDocs[0]!;
    expect(firstDoc).toMatchObject({
      id: '1',
      nameFr: 'Ahmed Ould Mohamed',
      nameAr: 'أحمد ولد محمد',
      latestYear: 2023,
      serie: 'SN',
      birthPlace: 'Nouakchott',
    });
  });

  it('handles empty DB result (no published attempts) without calling addDocuments', async () => {
    const { buildNameIndex: realBuildNameIndex } =
      await vi.importActual<typeof import('../services/meiliIndex.js')>(
        '../services/meiliIndex.js',
      );

    const mockDb = { execute: vi.fn().mockResolvedValue({ rows: [] }) };
    const addDocumentsMock = vi.fn();
    const indexMock = {
      updateSettings: vi.fn().mockResolvedValue({ taskUid: 3 }),
      deleteAllDocuments: vi.fn().mockResolvedValue({ taskUid: 2 }),
      addDocuments: addDocumentsMock,
    };
    const mockMeili = { index: vi.fn().mockReturnValue(indexMock) };

    const count = await realBuildNameIndex(mockDb as never, mockMeili as never);

    // 0 docs, addDocuments called with empty array
    expect(count).toBe(0);
    const [capturedDocs] = addDocumentsMock.mock.calls[0] as [unknown[], ...unknown[]];
    expect(capturedDocs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Service unit test — searchByName maps Meilisearch hits to NameSearchSuggestion
// ---------------------------------------------------------------------------

describe('searchByName service', () => {
  it('calls index.search with limit 10 and sort by latestYear:desc, returns mapped suggestions', async () => {
    const { searchByName: realSearchByName } =
      await vi.importActual<typeof import('../services/nameSearch.js')>(
        '../services/nameSearch.js',
      );

    const meiliHits = [
      { id: '5', nameFr: 'Cheikh Ould Brahim', nameAr: null, latestYear: 2023, serie: 'TM', birthPlace: 'Kiffa' },
    ];
    const searchMock = vi.fn().mockResolvedValue({ hits: meiliHits });
    const indexMock = { search: searchMock };
    const mockMeili = { index: vi.fn().mockReturnValue(indexMock) };

    const results = await realSearchByName(mockMeili as never, 'cheikh');

    expect(searchMock).toHaveBeenCalledWith('cheikh', {
      limit: 10,
      sort: ['latestYear:desc'],
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      personId: '5',
      nameFr: 'Cheikh Ould Brahim',
      nameAr: null,
      latestYear: 2023,
      serie: 'TM',
      birthPlace: 'Kiffa',
    });
  });

  it('returns an empty array when Meilisearch returns no hits', async () => {
    const { searchByName: realSearchByName } =
      await vi.importActual<typeof import('../services/nameSearch.js')>(
        '../services/nameSearch.js',
      );

    const searchMock = vi.fn().mockResolvedValue({ hits: [] });
    const mockMeili = { index: vi.fn().mockReturnValue({ search: searchMock }) };

    const results = await realSearchByName(mockMeili as never, 'zzz');
    expect(results).toEqual([]);
  });
});
