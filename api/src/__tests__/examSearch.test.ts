import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app.js';

// Module-level mocks for route integration tests
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

vi.mock('../services/examSearch.js', () => ({
  searchByExamNo: vi.fn(),
  getPublishedYears: vi.fn(),
  invalidateExamCache: vi.fn(),
  invalidateYearsCache: vi.fn(),
}));

vi.mock('../db/client.js', () => ({ db: {} }));
vi.mock('../lib/redis.js', () => ({ redis: {} }));

import { searchByExamNo, getPublishedYears } from '../services/examSearch.js';
import type { ExamSearchResult } from 'shared';

const mockSearchByExamNo = vi.mocked(searchByExamNo);
const mockGetPublishedYears = vi.mocked(getPublishedYears);

const RESULT_2022: ExamSearchResult = {
  personId: '1',
  nameFr: 'Ahmed Ould Mohamed',
  nameAr: 'أحمد ولد محمد',
  examNo: '00123',
  examYear: 2022,
  decision: 'Admis',
  moyenne: '14.50',
  serie: 'SN',
};

const RESULT_2023: ExamSearchResult = {
  personId: '2',
  nameFr: 'Fatima Mint Ali',
  nameAr: null,
  examNo: '00123',
  examYear: 2023,
  decision: 'Ajourné',
  moyenne: '09.75',
  serie: 'LM',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Route integration tests
// ---------------------------------------------------------------------------

describe('GET /api/search/exam', () => {
  it('returns 200 and the student payload on happy path', async () => {
    mockSearchByExamNo.mockResolvedValue(RESULT_2022);
    const app = createApp();
    const res = await app.request('/api/search/exam?no=00123&year=2022');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: ExamSearchResult };
    expect(body.data).toMatchObject({
      personId: '1',
      examNo: '00123',
      examYear: 2022,
      decision: 'Admis',
    });
    expect(mockSearchByExamNo).toHaveBeenCalledOnce();
  });

  it('returns 400 when exam number contains letters', async () => {
    const app = createApp();
    const res = await app.request('/api/search/exam?no=12AB&year=2022');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; issues: unknown[] } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.issues).toBeDefined();
    expect(mockSearchByExamNo).not.toHaveBeenCalled();
  });

  it('returns 400 when exam number is missing', async () => {
    const app = createApp();
    const res = await app.request('/api/search/exam?year=2022');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when year is missing', async () => {
    const app = createApp();
    const res = await app.request('/api/search/exam?no=00123');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when year is non-numeric', async () => {
    const app = createApp();
    const res = await app.request('/api/search/exam?no=00123&year=abc');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 STUDENT_NOT_FOUND when exam number is not in DB', async () => {
    mockSearchByExamNo.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/search/exam?no=99999&year=2022');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('STUDENT_NOT_FOUND');
    expect(typeof body.error.message).toBe('string');
  });

  it('returns 404 STUDENT_NOT_FOUND when the year is unpublished', async () => {
    mockSearchByExamNo.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/search/exam?no=00123&year=2024');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('STUDENT_NOT_FOUND');
  });

  it('same exam number in two published years returns two different personIds', async () => {
    const app = createApp();

    mockSearchByExamNo.mockResolvedValueOnce(RESULT_2022);
    const res2022 = await app.request('/api/search/exam?no=00123&year=2022');
    const body2022 = (await res2022.json()) as { data: ExamSearchResult };

    mockSearchByExamNo.mockResolvedValueOnce(RESULT_2023);
    const res2023 = await app.request('/api/search/exam?no=00123&year=2023');
    const body2023 = (await res2023.json()) as { data: ExamSearchResult };

    expect(res2022.status).toBe(200);
    expect(res2023.status).toBe(200);
    expect(body2022.data.personId).toBe('1');
    expect(body2023.data.personId).toBe('2');
    expect(body2022.data.personId).not.toBe(body2023.data.personId);
  });
});

describe('GET /api/search/years', () => {
  it('returns 200 with the list of published years, most recent first', async () => {
    mockGetPublishedYears.mockResolvedValue([2023, 2022]);
    const app = createApp();
    const res = await app.request('/api/search/years');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { years: number[] } };
    expect(body.data.years).toEqual([2023, 2022]);
  });

  it('returns 200 with an empty list when no years are published', async () => {
    mockGetPublishedYears.mockResolvedValue([]);
    const app = createApp();
    const res = await app.request('/api/search/years');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { years: number[] } };
    expect(body.data.years).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Service unit tests — cache-aside logic (use real implementation)
// ---------------------------------------------------------------------------

describe('searchByExamNo service — cache-aside', () => {
  it('serves from Redis cache without hitting the DB', async () => {
    const { searchByExamNo: realFn } =
      await vi.importActual<typeof import('../services/examSearch.js')>(
        '../services/examSearch.js',
      );

    const mockRedis = {
      get: vi.fn().mockResolvedValue(JSON.stringify(RESULT_2022)),
      set: vi.fn(),
    };
    const mockDb = { select: vi.fn() };

    const result = await realFn(mockDb as never, mockRedis as never, '00123', 2022);

    expect(result).toEqual(RESULT_2022);
    expect(mockRedis.get).toHaveBeenCalledWith('exam:2022:00123');
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('queries the DB and writes to Redis on a cache miss, then returns the result', async () => {
    const { searchByExamNo: realFn } =
      await vi.importActual<typeof import('../services/examSearch.js')>(
        '../services/examSearch.js',
      );

    const mockRedis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
    };

    const dbRow = {
      publicId: 'a1b2c3d4e5f6a1b2c3',
      nameFr: 'Ahmed',
      nameAr: null,
      examNo: '00123',
      examYear: 2022,
      decision: 'Admis' as const,
      moyenne: '14.50',
      serie: 'SN',
    };

    const limitMock = vi.fn().mockResolvedValue([dbRow]);
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: limitMock,
      }),
    };

    const result = await realFn(mockDb as never, mockRedis as never, '00123', 2022);

    expect(result).not.toBeNull();
    expect(result!.personId).toBe('a1b2c3d4e5f6a1b2c3');
    expect(result!.examNo).toBe('00123');
    expect(result!.decision).toBe('Admis');
    expect(result!.moyenne).toBe('14.50');
    expect(result!.serie).toBe('SN');
    expect(mockRedis.set).toHaveBeenCalledWith(
      'exam:2022:00123',
      expect.any(String),
      'EX',
      300,
    );
    expect(limitMock).toHaveBeenCalledWith(1);
  });

  it('returns null and skips cache write when DB returns no rows (unpublished year excluded)', async () => {
    const { searchByExamNo: realFn } =
      await vi.importActual<typeof import('../services/examSearch.js')>(
        '../services/examSearch.js',
      );

    const mockRedis = { get: vi.fn().mockResolvedValue(null), set: vi.fn() };
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }),
    };

    const result = await realFn(mockDb as never, mockRedis as never, '99999', 2024);
    expect(result).toBeNull();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });
});
