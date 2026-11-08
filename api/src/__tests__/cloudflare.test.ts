import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { purgeCloudflareCache } from '../lib/cloudflare.js';

const ORIGINAL_TOKEN = process.env['CLOUDFLARE_API_TOKEN'];
const ORIGINAL_ZONE = process.env['CLOUDFLARE_ZONE_ID'];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env['CLOUDFLARE_API_TOKEN'] = ORIGINAL_TOKEN;
  process.env['CLOUDFLARE_ZONE_ID'] = ORIGINAL_ZONE;
});

describe('purgeCloudflareCache', () => {
  it('is a no-op (no network call) when the token/zone are not configured', async () => {
    process.env['CLOUDFLARE_API_TOKEN'] = '';
    process.env['CLOUDFLARE_ZONE_ID'] = '';

    await purgeCloudflareCache();

    expect(fetch).not.toHaveBeenCalled();
  });

  it('purges everything via the Cloudflare API when configured', async () => {
    process.env['CLOUDFLARE_API_TOKEN'] = 'test-token';
    process.env['CLOUDFLARE_ZONE_ID'] = 'zone-123';
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));

    await purgeCloudflareCache();

    expect(fetch).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/zones/zone-123/purge_cache',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) as unknown,
        body: JSON.stringify({ purge_everything: true }),
      }),
    );
  });

  it('throws when the Cloudflare API responds with a non-OK status', async () => {
    process.env['CLOUDFLARE_API_TOKEN'] = 'test-token';
    process.env['CLOUDFLARE_ZONE_ID'] = 'zone-123';
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 403 }));

    await expect(purgeCloudflareCache()).rejects.toThrow('Cloudflare purge failed with status 403');
  });
});
