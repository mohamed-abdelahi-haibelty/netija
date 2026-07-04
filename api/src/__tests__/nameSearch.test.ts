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
vi.mock('../lib/meili.js', () => ({ meili: {}, ATTEMPTS_INDEX: 'attempts' }));

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
// Fixtures — one suggestion per attempt; the same name may appear in several
// years as separate rows.
// ---------------------------------------------------------------------------

const SUGGESTIONS: NameSearchSuggestion[] = [
  {
    slug: 'slug2023aaaa0000bbbb1111cccc2222',
    examYear: 2023,
    examNo: '00101',
    nameFr: 'Ahmed Ould Mohamed',
    nameAr: 'أحمد ولد محمد',
    serie: 'SN',
  },
  {
    slug: 'slug2022dddd3333eeee4444ffff5555',
    examYear: 2022,
    examNo: '00202',
    nameFr: 'Ahmed Ould Mohamed',
    nameAr: null,
    serie: 'LM',
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
      slug: 'slug2023aaaa0000bbbb1111cccc2222',
      examYear: 2023,
      examNo: '00101',
      nameFr: 'Ahmed Ould Mohamed',
      serie: 'SN',
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

  it('returns each matching year as a separate, newest-first row (no merging)', async () => {
    // Same name in three years — returned as three independent rows, newest first,
    // each carrying its own year + serie.
    const threeYears: NameSearchSuggestion[] = [
      { slug: 'slug25aaaa0000bbbb1111cccc222233', examYear: 2025, examNo: '00301', nameFr: 'Ahmed Ould Mohamed', nameAr: null, serie: 'TS' },
      { slug: 'slug24dddd3333eeee4444ffff555566', examYear: 2024, examNo: '00202', nameFr: 'Ahmed Ould Mohamed', nameAr: null, serie: 'LM' },
      { slug: 'slug23gggg7777hhhh8888iiii999900', examYear: 2023, examNo: '00101', nameFr: 'Ahmed Ould Mohamed', nameAr: null, serie: 'SN' },
    ];
    mockSearchByName.mockResolvedValue(threeYears);
    const app = createApp();
    const res = await app.request('/api/search/name?q=ahmed');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { suggestions: NameSearchSuggestion[] } };
    // Three separate rows for the same name — no merging into one person.
    expect(body.data.suggestions).toHaveLength(3);
    expect(body.data.suggestions.map((s) => s.nameFr)).toEqual([
      'Ahmed Ould Mohamed',
      'Ahmed Ould Mohamed',
      'Ahmed Ould Mohamed',
    ]);
    // Newest year first.
    expect(body.data.suggestions.map((s) => s.examYear)).toEqual([2025, 2024, 2023]);
    // Each row carries year + serie so the user can disambiguate.
    expect(body.data.suggestions.map((s) => s.serie)).toEqual(['TS', 'LM', 'SN']);
    // Each row carries its own distinct slug link.
    expect(new Set(body.data.suggestions.map((s) => s.slug)).size).toBe(3);
  });

  it('returns at most 10 suggestions (enforced by the service)', async () => {
    const tenSuggestions: NameSearchSuggestion[] = Array.from({ length: 10 }, (_, i) => ({
      slug: `slug${String(i + 1).padStart(4, '0')}00000000000000000000000000`,
      examYear: 2023,
      examNo: String(i + 1).padStart(5, '0'),
      nameFr: `Person ${String(i + 1)}`,
      nameAr: null,
      serie: 'SN',
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
// Service unit test — index builder produces one document per published attempt
// ---------------------------------------------------------------------------

describe('buildNameIndex service', () => {
  it('passes one document per published attempt to Meilisearch', async () => {
    const { buildNameIndex: realBuildNameIndex } =
      await vi.importActual<typeof import('../services/meiliIndex.js')>(
        '../services/meiliIndex.js',
      );

    // The SQL selects `public_slug AS id` and WHERE i.published = true excludes
    // unpublished attempts before they reach the mapper. The document id IS the slug.
    const dbRows = [
      { id: 'slug2023aaaa0000bbbb1111cccc2222', examYear: 2023, examNo: '00101', nameFr: 'Ahmed Ould Mohamed', nameAr: 'أحمد ولد محمد', serie: 'SN' },
      { id: 'slug2022dddd3333eeee4444ffff5555', examYear: 2022, examNo: '00202', nameFr: 'Fatima Mint Ali', nameAr: null, serie: 'LM' },
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

    const count = await realBuildNameIndex(mockDb as never, mockMeili as never);

    expect(count).toBe(2);

    // Correct index is addressed
    expect(mockMeili.index).toHaveBeenCalledWith('attempts');

    // Settings configure both searchable fields and sort field
    expect(updateSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        searchableAttributes: ['nameFr', 'nameAr'],
        sortableAttributes: ['examYear'],
      }),
    );

    // Full rebuild: clear before pushing
    expect(deleteAllMock).toHaveBeenCalledOnce();

    const [capturedDocs] = addDocumentsMock.mock.calls[0] as [
      Array<{ id: string; examYear: number; examNo: string; nameFr: string | null; nameAr: string | null; serie: string }>,
      ...unknown[]
    ];
    expect(capturedDocs).toHaveLength(2);
    // The Meili document id is the attempt's public slug.
    expect(capturedDocs.map((d) => d.id)).toEqual([
      'slug2023aaaa0000bbbb1111cccc2222',
      'slug2022dddd3333eeee4444ffff5555',
    ]);

    const [firstDoc] = capturedDocs;
    if (!firstDoc) throw new Error('expected at least one captured document');
    expect(firstDoc).toMatchObject({
      id: 'slug2023aaaa0000bbbb1111cccc2222',
      examYear: 2023,
      examNo: '00101',
      nameFr: 'Ahmed Ould Mohamed',
      nameAr: 'أحمد ولد محمد',
      serie: 'SN',
    });
  });

  it('produces one document per year for a name appearing in three years', async () => {
    const { buildNameIndex: realBuildNameIndex } =
      await vi.importActual<typeof import('../services/meiliIndex.js')>(
        '../services/meiliIndex.js',
      );

    // The SQL returns one row per published attempt, newest year first. The same
    // name in 2025/2024/2023 is three independent attempts → three documents.
    const dbRows = [
      { id: 'slug25aaaa0000bbbb1111cccc222233', examYear: 2025, examNo: '00301', nameFr: 'Ahmed Ould Mohamed', nameAr: null, serie: 'TS' },
      { id: 'slug24dddd3333eeee4444ffff555566', examYear: 2024, examNo: '00202', nameFr: 'Ahmed Ould Mohamed', nameAr: null, serie: 'LM' },
      { id: 'slug23gggg7777hhhh8888iiii999900', examYear: 2023, examNo: '00101', nameFr: 'Ahmed Ould Mohamed', nameAr: null, serie: 'SN' },
    ];
    const mockDb = { execute: vi.fn().mockResolvedValue({ rows: dbRows }) };

    const addDocumentsMock = vi.fn().mockResolvedValue({ taskUid: 1 });
    const indexMock = {
      updateSettings: vi.fn().mockResolvedValue({ taskUid: 3 }),
      deleteAllDocuments: vi.fn().mockResolvedValue({ taskUid: 2 }),
      addDocuments: addDocumentsMock,
    };
    const mockMeili = { index: vi.fn().mockReturnValue(indexMock) };

    const count = await realBuildNameIndex(mockDb as never, mockMeili as never);

    expect(count).toBe(3);
    const [capturedDocs] = addDocumentsMock.mock.calls[0] as [
      Array<{ id: string; examYear: number }>,
      ...unknown[]
    ];
    // Three documents with distinct slug ids — never collapsed into one.
    expect(capturedDocs).toHaveLength(3);
    expect(capturedDocs.map((d) => d.id)).toEqual([
      'slug25aaaa0000bbbb1111cccc222233',
      'slug24dddd3333eeee4444ffff555566',
      'slug23gggg7777hhhh8888iiii999900',
    ]);
    expect(new Set(capturedDocs.map((d) => d.id)).size).toBe(3);
  });

  it('handles empty DB result (no published attempts) without pushing documents', async () => {
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

    expect(count).toBe(0);
    const [capturedDocs] = addDocumentsMock.mock.calls[0] as [unknown[], ...unknown[]];
    expect(capturedDocs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Service unit test — searchByName maps Meilisearch hits to NameSearchSuggestion
// ---------------------------------------------------------------------------

describe('searchByName service', () => {
  it('calls index.search with limit 10 and sort by examYear:desc, returns mapped suggestions', async () => {
    const { searchByName: realSearchByName } =
      await vi.importActual<typeof import('../services/nameSearch.js')>(
        '../services/nameSearch.js',
      );

    // The Meili document id is the attempt's slug; searchByName maps it to `slug`.
    const meiliHits = [
      { id: 'slug55aaaa0000bbbb1111cccc222233', examYear: 2023, examNo: '00055', nameFr: 'Cheikh Ould Brahim', nameAr: null, serie: 'TM' },
    ];
    const searchMock = vi.fn().mockResolvedValue({ hits: meiliHits });
    const indexMock = { search: searchMock };
    const mockMeili = { index: vi.fn().mockReturnValue(indexMock) };

    const results = await realSearchByName(mockMeili as never, 'cheikh');

    expect(searchMock).toHaveBeenCalledWith('cheikh', {
      limit: 10,
      sort: ['examYear:desc'],
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      slug: 'slug55aaaa0000bbbb1111cccc222233',
      examYear: 2023,
      examNo: '00055',
      nameFr: 'Cheikh Ould Brahim',
      nameAr: null,
      serie: 'TM',
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
