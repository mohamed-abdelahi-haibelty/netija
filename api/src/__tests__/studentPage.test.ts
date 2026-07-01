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
// Fixtures — use realistic public_id strings (18-char hex, the DB default format)
// ---------------------------------------------------------------------------

const PID_SINGLE    = 'a1b2c3d4e5f6a1b2c3';
const PID_MULTI     = 'd4e5f6a1b2c3d4e5f6';
const PID_SEE_OTHER = 'b2c3d4e5f6a1b2c3d4';
const PID_WITH_SA   = 'e5f6a1b2c3d4e5f6a1';

const PERSON_SINGLE: StudentPageData = {
  personId: PID_SINGLE,
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
  personId: PID_MULTI,
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
  personId: PID_SEE_OTHER,
  nameFr: 'Mohamed Ould Ahmed',
  nameAr: null,
  examYear: 2022,
  examNo: '00303',
};

const PERSON_WITH_SEE_ALSO: StudentPageData = {
  personId: PID_WITH_SA,
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

describe('GET /api/students/:publicId', () => {
  it('returns 200 and the student payload for a known person', async () => {
    mockGetStudentPage.mockResolvedValue(PERSON_SINGLE);
    const app = createApp();
    const res = await app.request(`/api/students/${PID_SINGLE}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: StudentPageData };
    expect(body.data.personId).toBe(PID_SINGLE);
    expect(body.data.attempts).toHaveLength(1);
    expect(body.data.seeAlso).toHaveLength(0);
    expect(mockGetStudentPage).toHaveBeenCalledOnce();
  });

  it('returns attempts ordered newest year first (multi-attempt person)', async () => {
    mockGetStudentPage.mockResolvedValue(PERSON_MULTI);
    const app = createApp();
    const res = await app.request(`/api/students/${PID_MULTI}`);
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
    const res = await app.request(`/api/students/${PID_WITH_SA}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: StudentPageData };
    expect(body.data.seeAlso).toHaveLength(1);
    expect(body.data.seeAlso[0]!.personId).toBe(PID_SEE_OTHER);
    expect(body.data.seeAlso[0]!.examYear).toBe(2022);
  });

  it('returns no see-also when no pending suggestion exists', async () => {
    mockGetStudentPage.mockResolvedValue(PERSON_SINGLE);
    const app = createApp();
    const res = await app.request(`/api/students/${PID_SINGLE}`);
    const body = (await res.json()) as { data: StudentPageData };
    expect(body.data.seeAlso).toHaveLength(0);
  });

  it('returns 404 STUDENT_NOT_FOUND for an unknown public ID', async () => {
    mockGetStudentPage.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/students/c0ffeec0ffeec0ffeec0');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('STUDENT_NOT_FOUND');
  });

  it('returns 404 STUDENT_NOT_FOUND when all attempts are unpublished', async () => {
    // Service returns null when every attempt is unpublished
    mockGetStudentPage.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/students/deadbeefdeadbeef42');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('STUDENT_NOT_FOUND');
  });

  it('returns 400 VALIDATION_ERROR when publicId exceeds the length limit', async () => {
    const app = createApp();
    const res = await app.request('/api/students/' + 'a'.repeat(65));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mockGetStudentPage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Service unit tests — cache-aside logic
// ---------------------------------------------------------------------------

// makeChain produces a mock query builder whose terminal calls (.limit and
// .orderBy) both resolve to `resolved`. This covers both the person-lookup
// query (.limit) and the multi-row queries (.orderBy).
function makeChain(resolved: unknown[]) {
  const q: Record<string, unknown> = {
    from: vi.fn(() => q),
    innerJoin: vi.fn(() => q),
    where: vi.fn(() => q),
    limit: vi.fn().mockResolvedValue(resolved),
    orderBy: vi.fn().mockResolvedValue(resolved),
    then: (onfulfilled: (v: unknown[]) => unknown) =>
      Promise.resolve(resolved).then(onfulfilled),
    catch: (onrejected: (e: Error) => unknown) =>
      Promise.resolve(resolved).catch(onrejected),
    finally: (onfinally?: () => void) =>
      Promise.resolve(resolved).finally(onfinally),
  };
  return q;
}

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

    const result = await realFn(mockDb as never, mockRedis as never, PID_SINGLE);

    expect(result).toEqual(PERSON_SINGLE);
    expect(mockRedis.get).toHaveBeenCalledWith(`student:${PID_SINGLE}`);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('returns null and skips cache write when publicId does not resolve to any person', async () => {
    const { getStudentPage: realFn } =
      await vi.importActual<typeof import('../services/studentPage.js')>(
        '../services/studentPage.js',
      );

    const mockRedis = { get: vi.fn().mockResolvedValue(null), set: vi.fn() };
    // Person lookup returns empty — unknown publicId.
    const mockDb = { select: vi.fn().mockReturnValue(makeChain([])) };

    const result = await realFn(mockDb as never, mockRedis as never, 'unknownpublicid00');

    expect(result).toBeNull();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it('returns null and skips cache write when person has no attempt links', async () => {
    const { getStudentPage: realFn } =
      await vi.importActual<typeof import('../services/studentPage.js')>(
        '../services/studentPage.js',
      );

    const mockRedis = { get: vi.fn().mockResolvedValue(null), set: vi.fn() };

    let callCount = 0;
    const selectMock = vi.fn().mockImplementation(() => {
      callCount++;
      // Call 1: person lookup → found (id 42)
      // Call 2: allLinks → empty (no links)
      return makeChain(callCount === 1 ? [{ id: 42 }] : []);
    });
    const mockDb = { select: selectMock };

    const result = await realFn(mockDb as never, mockRedis as never, 'nolinkspublicid00');

    expect(result).toBeNull();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it('returns null and skips cache write when all attempts are unpublished', async () => {
    const { getStudentPage: realFn } =
      await vi.importActual<typeof import('../services/studentPage.js')>(
        '../services/studentPage.js',
      );

    const mockRedis = { get: vi.fn().mockResolvedValue(null), set: vi.fn() };

    let callCount = 0;
    const selectMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeChain([{ id: 42 }]);          // person lookup
      if (callCount === 2) return makeChain([{ attemptId: 5 }]);    // allLinks
      return makeChain([]);                                           // rawAttempts (unpublished filtered)
    });
    const mockDb = { select: selectMock };

    const result = await realFn(mockDb as never, mockRedis as never, 'unpublishedpid00');

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

    let callCount = 0;
    const selectMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeChain([{ id: 7 }]);           // person lookup
      if (callCount === 2) return makeChain([{ attemptId: 7 }]);    // allLinks
      if (callCount === 3) return makeChain([dbAttemptRow]);         // rawAttempts (published)
      return makeChain([]);                                           // dir1, dir2: no suggestions
    });
    const mockDb = { select: selectMock };

    const result = await realFn(mockDb as never, mockRedis as never, PID_SINGLE);

    expect(result).not.toBeNull();
    expect(result!.personId).toBe(PID_SINGLE);
    expect(result!.attempts).toHaveLength(1);
    expect(result!.attempts[0]!.decision).toBe('Admis');
    expect(result!.seeAlso).toHaveLength(0);
    expect(mockRedis.set).toHaveBeenCalledWith(
      `student:${PID_SINGLE}`,
      expect.any(String),
      'EX',
      3600,
    );
  });
});
