import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@sentry/node', () => ({ init: vi.fn() }));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('instrument (Sentry init)', () => {
  it('never calls Sentry.init when SENTRY_DSN is absent (local/test stays inert)', async () => {
    delete process.env['SENTRY_DSN'];
    const Sentry = await import('@sentry/node');
    await import('../instrument.js');
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('initializes with a low trace sample rate and the environment tag when SENTRY_DSN is set', async () => {
    process.env['SENTRY_DSN'] = 'https://example@o0.ingest.sentry.io/1';
    process.env['APP_ENV'] = 'staging';
    const Sentry = await import('@sentry/node');
    await import('../instrument.js');
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://example@o0.ingest.sentry.io/1',
        environment: 'staging',
        tracesSampleRate: 0.1,
      }),
    );
  });
});

describe('scrubPii', () => {
  it('strips query string, cookies, and body from the request, and the query part of the url', async () => {
    process.env['SENTRY_DSN'] = 'https://example@o0.ingest.sentry.io/1';
    const { scrubPii } = await import('../instrument.js');

    const event = {
      request: {
        url: 'https://api.example.com/api/search/exam?no=00573&year=2024',
        query_string: 'no=00573&year=2024',
        cookies: { session: 'secret-token' },
        data: { no: '00573' },
        headers: { cookie: 'session=secret-token', accept: 'application/json' },
      },
    };

    const scrubbed = scrubPii(event as never);

    expect(scrubbed.request?.url).toBe('https://api.example.com/api/search/exam');
    expect(scrubbed.request?.query_string).toBeUndefined();
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.data).toBeUndefined();
    expect(scrubbed.request?.headers).not.toHaveProperty('cookie');
    expect(scrubbed.request?.headers).toHaveProperty('accept');
  });

  it('is a no-op when the event has no request', async () => {
    process.env['SENTRY_DSN'] = 'https://example@o0.ingest.sentry.io/1';
    const { scrubPii } = await import('../instrument.js');

    const event = { message: 'boom' };
    expect(scrubPii(event as never)).toEqual(event);
  });
});
