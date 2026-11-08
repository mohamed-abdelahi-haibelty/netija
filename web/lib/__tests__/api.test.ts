import { apiRequest, ApiClientError } from '@/lib/api';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

// A minimal fetch Response stand-in — jsdom's test environment has no
// global Response constructor, and the real one is more than this needs.
function fakeResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: (name: string) => headers[name] ?? null },
  } as unknown as Response;
}

describe('apiRequest — error handling', () => {
  it('carries retryAfterSeconds from the Retry-After header on a RATE_LIMITED error', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      fakeResponse(
        429,
        { error: { code: 'RATE_LIMITED', message: 'Too many requests.' } },
        { 'Retry-After': '42' },
      ),
    );

    await expect(apiRequest('/api/search/exam?no=1&year=2024')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterSeconds: 42,
    });
  });

  it('leaves retryAfterSeconds undefined when the header is absent', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      fakeResponse(404, { error: { code: 'STUDENT_NOT_FOUND', message: 'No result.' } }),
    );

    let caught: unknown;
    try {
      await apiRequest('/api/search/exam?no=1&year=2024');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiClientError);
    expect((caught as ApiClientError).retryAfterSeconds).toBeUndefined();
  });
});

describe('apiRequest — base URL', () => {
  it('uses NEXT_PUBLIC_API_URL by default', async () => {
    const mockFetch = jest.fn().mockResolvedValue(fakeResponse(200, { data: {} }));
    global.fetch = mockFetch;

    await apiRequest('/api/results/abc');

    expect(mockFetch).toHaveBeenCalledWith(
      `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/results/abc`,
      expect.anything(),
    );
  });

  it('uses the override base URL when one is passed (server-side internal calls)', async () => {
    const mockFetch = jest.fn().mockResolvedValue(fakeResponse(200, { data: {} }));
    global.fetch = mockFetch;

    await apiRequest('/api/results/abc', undefined, 'http://api:3001');

    expect(mockFetch).toHaveBeenCalledWith('http://api:3001/api/results/abc', expect.anything());
  });
});
