import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app.js';

vi.mock('../lib/healthChecks.js', () => ({
  checkPostgres: vi.fn().mockResolvedValue(true),
  checkRedis: vi.fn().mockResolvedValue(true),
  checkMeilisearch: vi.fn().mockResolvedValue(true),
}));

vi.mock('../services/studentPage.js', () => ({
  getStudentPage: vi.fn(),
  invalidateStudentCache: vi.fn(),
}));

vi.mock('../db/client.js', () => ({ db: {} }));
vi.mock('../lib/redis.js', () => ({ redis: {} }));

import { getStudentPage } from '../services/studentPage.js';
import type { StudentPageData } from 'shared';

const mockGetStudentPage = vi.mocked(getStudentPage);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PERSON_SINGLE: StudentPageData = {
  personId: '10',
  nameFr: 'Ahmed Ould Mohamed',
  nameAr: 'أحمد ولد محمد',
  birthDate: '2002-03-15',
  birthPlace: 'Nouakchott',
  attempts: [
    {
      examYear: 2023,
      examNo: '00101',
      serie: 'SN',
      moyenne: '14.50',
      decision: 'Admis',
      decisionRaw: 'Admis Sn',
      school: 'Lycée Chiva',
      wilaya: 'Nouakchott Ouest',
    },
  ],
  seeAlso: [],
};

// Person with two attempts (redemption arc: Ajourné 2022 → Admis 2023)
const PERSON_MULTI: StudentPageData = {
  personId: '20',
  nameFr: 'Fatima Mint Ali',
  nameAr: null,
  birthDate: null,
  birthPlace: null,
  attempts: [
    {
      examYear: 2023,
      examNo: '00202',
      serie: 'LM',
      moyenne: '12.00',
      decision: 'Admis',
      decisionRaw: 'Admis',
      school: null,
      wilaya: null,
    },
    {
      examYear: 2022,
      examNo: '00202',
      serie: 'LM',
      moyenne: '08.75',
      decision: 'Ajourné',
      decisionRaw: 'Ajourné(e)',
      school: null,
      wilaya: null,
    },
  ],
  seeAlso: [],
};

// Person with a pending see-also suggestion
const SEE_ALSO_ENTRY = {
  personId: '30',
  nameFr: 'Mohamed Ould Ahmed',
  nameAr: null,
  examYear: 2022,
  examNo: '00303',
};

const PERSON_WITH_SEE_ALSO: StudentPageData = {
  personId: '31',
  nameFr: 'Mohamed Ould Ahmed',
  nameAr: null,
  birthDate: '2001-06-10',
  birthPlace: 'Nouadhibou',
  attempts: [
    {
      examYear: 2022,
      examNo: '00304',
      serie: 'SN',
      moyenne: '13.25',
      decision: 'Admis',
      decisionRaw: 'Admis',
      school: null,
      wilaya: null,
    },
  ],
  seeAlso: [SEE_ALSO_ENTRY],
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Route integration tests
// ---------------------------------------------------------------------------

describe('GET /api/students/:personId', () => {
  it('returns 200 and the student payload for a known person', async () => {
    mockGetStudentPage.mockResolvedValue(PERSON_SINGLE);
    const app = createApp();
    const res = await app.request('/api/students/10');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: StudentPageData };
    expect(body.data.personId).toBe('10');
    expect(body.data.attempts).toHaveLength(1);
    expect(body.data.seeAlso).toHaveLength(0);
    expect(mockGetStudentPage).toHaveBeenCalledOnce();
  });

  it('returns attempts ordered newest year first (multi-attempt person)', async () => {
    mockGetStudentPage.mockResolvedValue(PERSON_MULTI);
    const app = createApp();
    const res = await app.request('/api/students/20');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: StudentPageData };
    expect(body.data.attempts).toHaveLength(2);
    expect(body.data.attempts[0]!.examYear).toBe(2023);
    expect(body.data.attempts[1]!.examYear).toBe(2022);
    expect(body.data.attempts[0]!.decision).toBe('Admis');
    expect(body.data.attempts[1]!.decision).toBe('Ajourné');
  });

  it('includes see-also when a pending suggestion exists for this person', async () => {
    mockGetStudentPage.mockResolvedValue(PERSON_WITH_SEE_ALSO);
    const app = createApp();
    const res = await app.request('/api/students/31');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: StudentPageData };
    expect(body.data.seeAlso).toHaveLength(1);
    expect(body.data.seeAlso[0]!.personId).toBe('30');
    expect(body.data.seeAlso[0]!.examYear).toBe(2022);
  });

  it('returns no see-also when no pending suggestion exists', async () => {
    mockGetStudentPage.mockResolvedValue(PERSON_SINGLE);
    const app = createApp();
    const res = await app.request('/api/students/10');
    const body = (await res.json()) as { data: StudentPageData };
    expect(body.data.seeAlso).toHaveLength(0);
  });

  it('returns 404 STUDENT_NOT_FOUND for an unknown person ID', async () => {
    mockGetStudentPage.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/students/99999');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('STUDENT_NOT_FOUND');
  });

  it('returns 404 STUDENT_NOT_FOUND when all attempts are unpublished', async () => {
    // Service returns null when every attempt is unpublished
    mockGetStudentPage.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/students/42');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('STUDENT_NOT_FOUND');
  });

  it('returns 400 VALIDATION_ERROR when personId is not numeric', async () => {
    const app = createApp();
    const res = await app.request('/api/students/abc');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mockGetStudentPage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Service unit tests — cache-aside logic
// ---------------------------------------------------------------------------

describe('getStudentPage service — cache-aside', () => {
  it('serves from Redis cache without hitting the DB', async () => {
    const { getStudentPage: realFn } =
      await vi.importActual<typeof import('../services/studentPage.js')>(
        '../services/studentPage.js',
      );

    const mockRedis = {
      get: vi.fn().mockResolvedValue(JSON.stringify(PERSON_SINGLE)),
      set: vi.fn(),
    };
    const mockDb = { select: vi.fn() };

    const result = await realFn(mockDb as never, mockRedis as never, 10);

    expect(result).toEqual(PERSON_SINGLE);
    expect(mockRedis.get).toHaveBeenCalledWith('student:10');
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('returns null and skips cache write when person has no links (unknown id)', async () => {
    const { getStudentPage: realFn } =
      await vi.importActual<typeof import('../services/studentPage.js')>(
        '../services/studentPage.js',
      );

    const mockRedis = { get: vi.fn().mockResolvedValue(null), set: vi.fn() };

    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    });
    const mockDb = { select: selectMock };

    const result = await realFn(mockDb as never, mockRedis as never, 99999);

    expect(result).toBeNull();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it('returns null and skips cache write when all attempts are unpublished', async () => {
    const { getStudentPage: realFn } =
      await vi.importActual<typeof import('../services/studentPage.js')>(
        '../services/studentPage.js',
      );

    const mockRedis = { get: vi.fn().mockResolvedValue(null), set: vi.fn() };

    // Build a thenable chain so both `await chain.where()` and
    // `await chain.where().orderBy()` work without separate mocks.
    const makeChain = (resolved: unknown[]) => {
      const q = {
        from: vi.fn(() => q),
        innerJoin: vi.fn(() => q),
        where: vi.fn(() => q),
        orderBy: vi.fn().mockResolvedValue(resolved),
        then: (onfulfilled: (v: unknown[]) => unknown) =>
          Promise.resolve(resolved).then(onfulfilled),
        catch: (onrejected: (e: Error) => unknown) =>
          Promise.resolve(resolved).catch(onrejected),
        finally: (onfinally?: () => void) =>
          Promise.resolve(resolved).finally(onfinally),
      };
      return q;
    };

    let callCount = 0;
    const selectMock = vi.fn().mockImplementation(() => {
      callCount++;
      return makeChain(callCount === 1 ? [{ attemptId: 5 }] : []);
    });
    const mockDb = { select: selectMock };

    const result = await realFn(mockDb as never, mockRedis as never, 42);

    expect(result).toBeNull();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it('writes to cache on DB hit and returns full payload', async () => {
    const { getStudentPage: realFn } =
      await vi.importActual<typeof import('../services/studentPage.js')>(
        '../services/studentPage.js',
      );

    const mockRedis = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') };

    const dbAttemptRow = {
      examYear: 2023,
      examNo: '00101',
      serie: 'SN',
      moyenne: '14.50',
      decision: 'Admis',
      decisionRaw: 'Admis',
      school: null,
      wilaya: null,
      nameFr: 'Ahmed',
      nameAr: null,
      birthDate: null,
      birthPlace: null,
    };

    const makeChain = (resolved: unknown[]) => {
      const q = {
        from: vi.fn(() => q),
        innerJoin: vi.fn(() => q),
        where: vi.fn(() => q),
        orderBy: vi.fn().mockResolvedValue(resolved),
        then: (onfulfilled: (v: unknown[]) => unknown) =>
          Promise.resolve(resolved).then(onfulfilled),
        catch: (onrejected: (e: Error) => unknown) =>
          Promise.resolve(resolved).catch(onrejected),
        finally: (onfinally?: () => void) =>
          Promise.resolve(resolved).finally(onfinally),
      };
      return q;
    };

    let callCount = 0;
    const selectMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeChain([{ attemptId: 7 }]); // allLinks
      if (callCount === 2) return makeChain([dbAttemptRow]);       // rawAttempts (published)
      return makeChain([]);                                         // dir1, dir2: no suggestions
    });
    const mockDb = { select: selectMock };

    const result = await realFn(mockDb as never, mockRedis as never, 7);

    expect(result).not.toBeNull();
    expect(result!.personId).toBe('7');
    expect(result!.attempts).toHaveLength(1);
    expect(result!.attempts[0]!.decision).toBe('Admis');
    expect(result!.seeAlso).toHaveLength(0);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'student:7',
      expect.any(String),
      'EX',
      3600,
    );
  });
});
