import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp } from '../app.js';

vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));

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

import { checkMeilisearch } from '../lib/healthChecks.js';

const mockCheckMeilisearch = vi.mocked(checkMeilisearch);

const ORIGINAL_MEILI_HOST = process.env['MEILI_HOST'];
const ORIGINAL_MEILISEARCH_URL = process.env['MEILISEARCH_URL'];

beforeEach(() => {
  mockCheckMeilisearch.mockClear();
  mockCheckMeilisearch.mockResolvedValue(true);
});

afterEach(() => {
  process.env['MEILI_HOST'] = ORIGINAL_MEILI_HOST;
  process.env['MEILISEARCH_URL'] = ORIGINAL_MEILISEARCH_URL;
});

// Regression test for the MEILI_HOST/MEILISEARCH_URL split: meili.ts (the
// real Meilisearch client used everywhere else) reads MEILI_HOST, so
// /health/ready must check the exact same variable — otherwise the two can
// disagree and the health check misreports a healthy instance as down (or
// vice versa) purely because only one of the two was set in the deploy env.
describe('GET /health/ready reads the same Meilisearch var as the app', () => {
  it('passes MEILI_HOST to checkMeilisearch, not MEILISEARCH_URL', async () => {
    process.env['MEILI_HOST'] = 'http://meili-host-value:7700';
    process.env['MEILISEARCH_URL'] = 'http://meilisearch-url-value:7700';

    const app = createApp();
    await app.request('/health/ready');

    expect(mockCheckMeilisearch).toHaveBeenCalledWith('http://meili-host-value:7700');
  });

  it('reports Meilisearch down when only MEILISEARCH_URL is set (MEILI_HOST unset)', async () => {
    delete process.env['MEILI_HOST'];
    process.env['MEILISEARCH_URL'] = 'http://meilisearch-url-value:7700';
    mockCheckMeilisearch.mockImplementation((url) => Promise.resolve(url !== ''));

    const app = createApp();
    const res = await app.request('/health/ready');

    expect(mockCheckMeilisearch).toHaveBeenCalledWith('');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ meilisearch: false });
  });
});
