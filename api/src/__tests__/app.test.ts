import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import { createApp } from '../app.js';

vi.mock('../lib/healthChecks.js', () => ({
  checkPostgres: vi.fn().mockResolvedValue(true),
  checkRedis: vi.fn().mockResolvedValue(true),
  checkMeilisearch: vi.fn().mockResolvedValue(true),
}));

import {
  checkPostgres,
  checkRedis,
  checkMeilisearch,
} from '../lib/healthChecks.js';

const mockCheckPostgres = vi.mocked(checkPostgres);
const mockCheckRedis = vi.mocked(checkRedis);
const mockCheckMeilisearch = vi.mocked(checkMeilisearch);

beforeEach(() => {
  mockCheckPostgres.mockResolvedValue(true);
  mockCheckRedis.mockResolvedValue(true);
  mockCheckMeilisearch.mockResolvedValue(true);
});

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const app = createApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

describe('GET /health/ready', () => {
  it('returns 200 when all dependencies are reachable', async () => {
    const app = createApp();
    const res = await app.request('/health/ready');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ postgres: true, redis: true, meilisearch: true });
  });

  it('returns 503 with correct booleans when postgres is unreachable', async () => {
    mockCheckPostgres.mockResolvedValue(false);
    const app = createApp();
    const res = await app.request('/health/ready');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ postgres: false, redis: true, meilisearch: true });
  });

  it('returns 503 with correct booleans when redis is unreachable', async () => {
    mockCheckRedis.mockResolvedValue(false);
    const app = createApp();
    const res = await app.request('/health/ready');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ postgres: true, redis: false, meilisearch: true });
  });

  it('returns 503 with correct booleans when meilisearch is unreachable', async () => {
    mockCheckMeilisearch.mockResolvedValue(false);
    const app = createApp();
    const res = await app.request('/health/ready');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ postgres: true, redis: true, meilisearch: false });
  });
});

describe('unknown routes', () => {
  it('returns 404 with standard error shape', async () => {
    const app = createApp();
    const res = await app.request('/no-such-route');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(typeof body.error.code).toBe('string');
    expect(typeof body.error.message).toBe('string');
  });
});

describe('central error handler', () => {
  it('returns the standard 500 shape without leaking the internal message', async () => {
    const app = createApp();
    app.get('/test/throw', () => {
      throw new Error('secret internal details');
    });
    const res = await app.request('/test/throw');
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL');
    expect(body.error.message).not.toContain('secret');
  });

  it('passes HTTPException through with its status and standard shape', async () => {
    const app = createApp();
    app.get('/test/http-exception', () => {
      throw new HTTPException(403, { message: 'not allowed' });
    });
    const res = await app.request('/test/http-exception');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toBe('not allowed');
  });
});

describe('X-Request-Id header', () => {
  it('is present on a successful response', async () => {
    const app = createApp();
    const res = await app.request('/health');
    expect(res.headers.get('X-Request-Id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('is present on a 404 response', async () => {
    const app = createApp();
    const res = await app.request('/no-such-route');
    expect(res.headers.get('X-Request-Id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('is present on a 500 response', async () => {
    const app = createApp();
    app.get('/test/throw-for-id', () => {
      throw new Error('boom');
    });
    const res = await app.request('/test/throw-for-id');
    expect(res.headers.get('X-Request-Id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
