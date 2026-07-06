import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app.js';

function assertFound<T>(value: T | null): asserts value is T {
  expect(value).not.toBeNull();
}

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
  getAdminResultPreview: vi.fn(),
  invalidateStudentCache: vi.fn(),
  resultCacheKey: (slug: string) => `result:${slug}`,
}));

vi.mock('../db/client.js', () => ({ db: {} }));
// incr/expire back the rate-limit middleware (the public GET /:slug route
// goes through it now); the actual rate-limit behavior is covered in
// rateLimit.test.ts, so a permissive stub here keeps these route tests
// focused on the result-page behavior itself.
vi.mock('../lib/redis.js', () => ({
  redis: { incr: vi.fn().mockResolvedValue(1), expire: vi.fn().mockResolvedValue(1) },
}));

import { auth } from '../lib/auth.js';
import { getStudentPage, getAdminResultPreview } from '../services/studentPage.js';
import type { StudentResult } from 'shared';

const mockGetSession = vi.mocked(auth.api.getSession);
const mockGetStudentPage = vi.mocked(getStudentPage);
const mockGetAdminResultPreview = vi.mocked(getAdminResultPreview);

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

// ---------------------------------------------------------------------------
// Fixtures — the public result page is addressed by a random slug; internal
// identity remains (examYear, examNo).
// ---------------------------------------------------------------------------

const SLUG = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';

const RESULT: StudentResult = {
  slug: SLUG,
  examType: 'bac',
  examYear: 2023,
  examNo: '00101',
  nameFr: 'Ahmed Ould Mohamed',
  nameAr: 'أحمد ولد محمد',
  serie: 'SN',
  moyenne: '14.50',
  decision: 'Admis',
  decisionRaw: 'Admis Sn',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(VALID_SESSION);
});

// ---------------------------------------------------------------------------
// Route integration tests
// ---------------------------------------------------------------------------

describe('GET /api/results/:slug', () => {
  it('returns 200 and the result payload for a known slug', async () => {
    mockGetStudentPage.mockResolvedValue(RESULT);
    const app = createApp();
    const res = await app.request(`/api/results/${SLUG}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: StudentResult };
    expect(body.data.slug).toBe(SLUG);
    expect(body.data.examYear).toBe(2023);
    expect(body.data.decision).toBe('Admis');
    expect(mockGetStudentPage).toHaveBeenCalledOnce();
    expect(mockGetStudentPage).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      SLUG,
    );
  });

  it('returns 404 STUDENT_NOT_FOUND for an unknown slug', async () => {
    mockGetStudentPage.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/results/deadbeefdeadbeefdeadbeefdeadbeef');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('STUDENT_NOT_FOUND');
  });

  it('returns 404 STUDENT_NOT_FOUND when the attempt is unpublished', async () => {
    // Service returns null when the slug's attempt belongs to an unpublished import
    mockGetStudentPage.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/results/c0ffeec0ffeec0ffeec0ffeec0ffee00');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('STUDENT_NOT_FOUND');
  });

  it('returns 400 VALIDATION_ERROR when the slug contains illegal characters', async () => {
    const app = createApp();
    const res = await app.request('/api/results/not%2Fa%2Fslug');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mockGetStudentPage).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when the slug exceeds the length limit', async () => {
    const app = createApp();
    const res = await app.request('/api/results/' + 'a'.repeat(65));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mockGetStudentPage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Admin preview route — auth-gated, bypasses the published filter
// ---------------------------------------------------------------------------

describe('GET /api/results/:slug/admin', () => {
  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request(`/api/results/${SLUG}/admin`);
    expect(res.status).toBe(401);
    expect(mockGetAdminResultPreview).not.toHaveBeenCalled();
  });

  it('returns 200 with the result payload for an unpublished attempt (bypasses the published filter)', async () => {
    mockGetAdminResultPreview.mockResolvedValue(RESULT);
    const app = createApp();
    const res = await app.request(`/api/results/${SLUG}/admin`);

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = (await res.json()) as { data: StudentResult };
    expect(body.data.slug).toBe(SLUG);
    expect(mockGetAdminResultPreview).toHaveBeenCalledWith({}, SLUG);
  });

  it('returns 404 STUDENT_NOT_FOUND for an unknown slug', async () => {
    mockGetAdminResultPreview.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/results/deadbeefdeadbeefdeadbeefdeadbeef/admin');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('STUDENT_NOT_FOUND');
  });

  it('returns 400 VALIDATION_ERROR for an illegal slug', async () => {
    const app = createApp();
    const res = await app.request('/api/results/not%2Fa%2Fslug/admin');
    expect(res.status).toBe(400);
    expect(mockGetAdminResultPreview).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Service unit tests — cache-aside logic (keyed by slug)
// ---------------------------------------------------------------------------

// makeChain produces a mock query builder whose terminal call (.limit) resolves
// to `resolved`.
function makeChain(resolved: unknown[]) {
  const q: Record<string, unknown> = {
    from: vi.fn(() => q),
    innerJoin: vi.fn(() => q),
    where: vi.fn(() => q),
    limit: vi.fn().mockResolvedValue(resolved),
  };
  return q;
}

describe('getStudentPage service — cache-aside', () => {
  it('serves from Redis cache (keyed by slug) without hitting the DB', async () => {
    const { getStudentPage: realFn } =
      await vi.importActual<typeof import('../services/studentPage.js')>(
        '../services/studentPage.js',
      );

    const mockRedis = {
      get: vi.fn().mockResolvedValue(JSON.stringify(RESULT)),
      set: vi.fn(),
    };
    const mockDb = { select: vi.fn() };

    const result = await realFn(mockDb as never, mockRedis as never, SLUG);

    expect(result).toEqual(RESULT);
    expect(mockRedis.get).toHaveBeenCalledWith(`result:${SLUG}`);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('returns null and skips cache write when no published attempt matches the slug', async () => {
    const { getStudentPage: realFn } =
      await vi.importActual<typeof import('../services/studentPage.js')>(
        '../services/studentPage.js',
      );

    const mockRedis = { get: vi.fn().mockResolvedValue(null), set: vi.fn() };
    const mockDb = { select: vi.fn().mockReturnValue(makeChain([])) };

    const result = await realFn(mockDb as never, mockRedis as never, 'unknownslug00000000000000000000');

    expect(result).toBeNull();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it('writes to cache on DB hit and returns the full payload including the slug', async () => {
    const { getStudentPage: realFn } =
      await vi.importActual<typeof import('../services/studentPage.js')>(
        '../services/studentPage.js',
      );

    const mockRedis = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') };
    const mockDb = { select: vi.fn().mockReturnValue(makeChain([RESULT])) };

    const result = await realFn(mockDb as never, mockRedis as never, SLUG);

    assertFound(result);
    expect(result.slug).toBe(SLUG);
    expect(result.examNo).toBe('00101');
    expect(mockRedis.set).toHaveBeenCalledWith(
      `result:${SLUG}`,
      expect.any(String),
      'EX',
      3600,
    );
  });
});

// ---------------------------------------------------------------------------
// getAdminResultPreview service — no published filter, no cache
// ---------------------------------------------------------------------------

describe('getAdminResultPreview service', () => {
  it('returns an attempt even when its import is unpublished (no published filter in the query)', async () => {
    const { getAdminResultPreview: realFn } =
      await vi.importActual<typeof import('../services/studentPage.js')>(
        '../services/studentPage.js',
      );

    const mockDb = { select: vi.fn().mockReturnValue(makeChain([RESULT])) };

    const result = await realFn(mockDb as never, SLUG);

    expect(result).toEqual(RESULT);
  });

  it('returns null for an unknown slug', async () => {
    const { getAdminResultPreview: realFn } =
      await vi.importActual<typeof import('../services/studentPage.js')>(
        '../services/studentPage.js',
      );

    const mockDb = { select: vi.fn().mockReturnValue(makeChain([])) };

    const result = await realFn(mockDb as never, 'unknownslug00000000000000000000');

    expect(result).toBeNull();
  });
});
