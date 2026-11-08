import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import type { ExamSearchResult, StudentResult } from 'shared';

// A minimal in-memory fixed-window counter standing in for real Redis
// INCR/EXPIRE semantics. Declared via vi.hoisted so the vi.mock factory
// below (which vitest hoists above these imports) can reference it.
const { fakeRedis, resetFakeRedis } = vi.hoisted(() => {
  let counts = new Map<string, number>();
  return {
    fakeRedis: {
      incr: vi.fn((key: string) => {
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return Promise.resolve(next);
      }),
      expire: vi.fn(() => Promise.resolve(1)),
    },
    resetFakeRedis: () => {
      counts = new Map();
    },
  };
});

vi.mock('../lib/redis.js', () => ({ redis: fakeRedis }));

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
  getPublishedYears: vi.fn().mockResolvedValue([]),
  invalidateYearsCache: vi.fn(),
}));

vi.mock('../services/nameSearch.js', () => ({
  searchByName: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/studentPage.js', () => ({
  getStudentPage: vi.fn(),
  getAdminResultPreview: vi.fn().mockResolvedValue(null),
  resultCacheKey: (slug: string) => `result:${slug}`,
}));

vi.mock('../services/importList.js', () => ({
  listImports: vi.fn().mockResolvedValue([]),
}));

vi.mock('../db/client.js', () => ({ db: {} }));
vi.mock('../lib/meili.js', () => ({ meili: {}, ATTEMPTS_INDEX: 'attempts' }));

import { auth } from '../lib/auth.js';
import { searchByExamNo } from '../services/examSearch.js';
import { getStudentPage } from '../services/studentPage.js';
import { RATE_LIMIT_MAX_REQUESTS } from '../lib/rateLimit.js';

const mockGetSession = vi.mocked(auth.api.getSession);
const mockSearchByExamNo = vi.mocked(searchByExamNo);
const mockGetStudentPage = vi.mocked(getStudentPage);

const EXAM_RESULT: ExamSearchResult = {
  slug: 'aaaa1111bbbb2222cccc3333dddd4444',
  examType: 'bac',
  nameFr: 'Ahmed Ould Mohamed',
  nameAr: null,
  examNo: '00123',
  examYear: 2022,
  decision: 'Admis',
  moyenne: '14.50',
  serie: 'SN',
};

const STUDENT_RESULT: StudentResult = {
  slug: 'aaaa1111bbbb2222cccc3333dddd4444',
  examType: 'bac',
  examYear: 2022,
  examNo: '00123',
  nameFr: 'Ahmed Ould Mohamed',
  nameAr: null,
  serie: 'SN',
  moyenne: '14.50',
  decision: 'Admis',
  decisionRaw: 'Admis',
};

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
  resetFakeRedis();
  mockSearchByExamNo.mockResolvedValue(EXAM_RESULT);
  mockGetStudentPage.mockResolvedValue(STUDENT_RESULT);
});

function ipHeaders(ip: string): HeadersInit {
  return { 'CF-Connecting-IP': ip };
}

describe('rate limiting — public search endpoint', () => {
  it('allows requests up to the limit and reports decreasing remaining count', async () => {
    const app = createApp();

    const first = await app.request('/api/search/exam?no=00123&year=2022', {
      headers: ipHeaders('1.1.1.1'),
    });
    expect(first.status).toBe(200);
    expect(first.headers.get('X-RateLimit-Limit')).toBe(String(RATE_LIMIT_MAX_REQUESTS));
    expect(first.headers.get('X-RateLimit-Remaining')).toBe(String(RATE_LIMIT_MAX_REQUESTS - 1));

    const second = await app.request('/api/search/exam?no=00123&year=2022', {
      headers: ipHeaders('1.1.1.1'),
    });
    expect(second.status).toBe(200);
    expect(second.headers.get('X-RateLimit-Remaining')).toBe(String(RATE_LIMIT_MAX_REQUESTS - 2));
  });

  it('returns 429 with Retry-After and the standard RATE_LIMITED error shape once the limit is exceeded', async () => {
    const app = createApp();
    const headers = ipHeaders('2.2.2.2');

    let last;
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS + 1; i++) {
      last = await app.request('/api/search/exam?no=00123&year=2022', { headers });
    }

    expect(last?.status).toBe(429);
    const retryAfter = last?.headers.get('Retry-After');
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);

    const body = (await last?.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(typeof body.error.message).toBe('string');
  });

  it('keys counters by client identity — one IP hitting the limit does not affect another', async () => {
    const app = createApp();

    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS + 1; i++) {
      await app.request('/api/search/exam?no=00123&year=2022', {
        headers: ipHeaders('3.3.3.3'),
      });
    }
    const blocked = await app.request('/api/search/exam?no=00123&year=2022', {
      headers: ipHeaders('3.3.3.3'),
    });
    expect(blocked.status).toBe(429);

    const otherIp = await app.request('/api/search/exam?no=00123&year=2022', {
      headers: ipHeaders('4.4.4.4'),
    });
    expect(otherIp.status).toBe(200);
  });

  it('falls back to X-Forwarded-For, then a shared bucket, when Cloudflare header is absent', async () => {
    const app = createApp();

    const res = await app.request('/api/search/exam?no=00123&year=2022', {
      headers: { 'X-Forwarded-For': '5.5.5.5, 9.9.9.9' },
    });
    expect(res.status).toBe(200);

    const noHeaders = await app.request('/api/search/exam?no=00123&year=2022');
    expect(noHeaders.status).toBe(200);
  });

  it('does not cache an error response (validation failure) at the edge', async () => {
    const app = createApp();
    const res = await app.request('/api/search/exam?no=12AB&year=2022');
    expect(res.status).toBe(400);
    expect(res.headers.get('Cache-Control')).toBeNull();
  });
});

describe('rate limiting — public result endpoint', () => {
  it('rate limits /api/results/:slug independently from /api/search', async () => {
    const app = createApp();
    const headers = ipHeaders('6.6.6.6');

    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS + 1; i++) {
      await app.request(`/api/results/${STUDENT_RESULT.slug}`, { headers });
    }
    const blocked = await app.request(`/api/results/${STUDENT_RESULT.slug}`, { headers });
    expect(blocked.status).toBe(429);

    // The search route class has its own independent budget for this IP.
    const searchStillOk = await app.request('/api/search/exam?no=00123&year=2022', { headers });
    expect(searchStillOk.status).toBe(200);
  });

  it('never rate limits a request carrying no CF-Connecting-IP or X-Forwarded-For (web\'s own server-side fetch)', async () => {
    // 2026-07-12 fix: a request with neither header can only be web's own
    // trusted SSR call for the result page — every one of its visitors was
    // previously colliding into one shared 'unknown' bucket. See
    // progress-tracker.md.
    const app = createApp();
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS + 5; i++) {
      const res = await app.request(`/api/results/${STUDENT_RESULT.slug}`);
      expect(res.status).toBe(200);
    }
    expect(fakeRedis.incr).not.toHaveBeenCalled();
  });

  it('still rate limits header-less requests on /api/search (unlike /api/results)', async () => {
    // The exemption above is scoped to the results route only — search's
    // real callers are always browser-side and always carry the header, so
    // a header-less flood there is still suspicious and still capped.
    const app = createApp();

    let last;
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS + 1; i++) {
      last = await app.request('/api/search/exam?no=00123&year=2022');
    }
    expect(last?.status).toBe(429);
  });
});

describe('rate limiting — exempt routes', () => {
  it('never rate limits /health, no matter how many requests', async () => {
    const app = createApp();
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS + 5; i++) {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
    }
    expect(fakeRedis.incr).not.toHaveBeenCalled();
  });

  it('never rate limits authenticated admin routes', async () => {
    mockGetSession.mockResolvedValue(VALID_SESSION);
    const app = createApp();
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS + 5; i++) {
      const res = await app.request('/api/imports');
      expect(res.status).toBe(200);
    }
    expect(fakeRedis.incr).not.toHaveBeenCalled();
  });

  it('never rate limits the auth-gated admin result preview', async () => {
    mockGetSession.mockResolvedValue(VALID_SESSION);
    const app = createApp();
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS + 5; i++) {
      await app.request(`/api/results/${STUDENT_RESULT.slug}/admin`);
    }
    expect(fakeRedis.incr).not.toHaveBeenCalled();
  });
});

describe('Cache-Control headers per route class', () => {
  it('sets a short public TTL on public search responses', async () => {
    const app = createApp();
    const res = await app.request('/api/search/exam?no=00123&year=2022');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
  });

  it('sets a longer public TTL on the public result page', async () => {
    const app = createApp();
    const res = await app.request(`/api/results/${STUDENT_RESULT.slug}`);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
  });

  it('sets no-store on the authenticated admin result preview', async () => {
    mockGetSession.mockResolvedValue(VALID_SESSION);
    const app = createApp();
    const res = await app.request(`/api/results/${STUDENT_RESULT.slug}/admin`);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('sets no-store on admin (imports) routes', async () => {
    mockGetSession.mockResolvedValue(VALID_SESSION);
    const app = createApp();
    const res = await app.request('/api/imports');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('sets no-store on admin routes even when unauthenticated (401)', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/imports');
    expect(res.status).toBe(401);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('sets no-store on auth routes', async () => {
    const app = createApp();
    const res = await app.request('/api/auth/get-session');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
