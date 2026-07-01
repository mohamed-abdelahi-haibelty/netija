import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { requireSession } from '../middleware/requireSession.js';

// Mock auth module so tests don't need a real DB or BETTER_AUTH_SECRET
vi.mock('../lib/auth.js', () => ({
  auth: {
    handler: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('../db/client.js', () => ({ db: {} }));

import { auth } from '../lib/auth.js';
const mockGetSession = vi.mocked(auth.api.getSession);

// Helper: create an app with a protected test route
function makeApp() {
  const app = createApp();
  app.get('/test/protected', requireSession, (c) =>
    c.json({ data: { ok: true } }),
  );
  return app;
}

describe('requireSession middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 with UNAUTHENTICATED code when no session exists', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = makeApp();
    const res = await app.request('/test/protected');
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 200 and passes through when a valid session exists', async () => {
    mockGetSession.mockResolvedValue({
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
    });
    const app = makeApp();
    const res = await app.request('/test/protected');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { ok: boolean } };
    expect(body.data.ok).toBe(true);
  });

  it('calls getSession with the request headers', async () => {
    mockGetSession.mockResolvedValue(null);
    const app = makeApp();
    await app.request('/test/protected', {
      headers: { cookie: 'better-auth.session_token=abc123' },
    });
    expect(mockGetSession).toHaveBeenCalledOnce();
    const calledWith = mockGetSession.mock.calls[0]?.[0];
    expect(calledWith).toBeDefined();
  });
});

describe('POST /api/auth/sign-up/email', () => {
  it('returns 403 FORBIDDEN to block public registration', async () => {
    const app = createApp();
    const res = await app.request('/api/auth/sign-up/email', { method: 'POST' });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');
  });
});

describe('GET /api/auth/get-session (Better Auth pass-through)', () => {
  it('delegates to the Better Auth handler', async () => {
    const mockHandler = vi.mocked(auth.handler);
    mockHandler.mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 'u1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const app = createApp();
    const res = await app.request('/api/auth/get-session');
    expect(mockHandler).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});
