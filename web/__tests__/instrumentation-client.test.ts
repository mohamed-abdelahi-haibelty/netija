export {};

jest.mock('@sentry/nextjs', () => ({ init: jest.fn() }));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('browser instrumentation (error-handling.md: Sentry init per runtime)', () => {
  it('never initializes Sentry without NEXT_PUBLIC_SENTRY_DSN', async () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    const sentry = jest.mocked(await import('@sentry/nextjs'));

    await import('../instrumentation-client');

    expect(sentry.init).not.toHaveBeenCalled();
  });

  it('initializes with a low trace sample rate and the browser environment tag when set', async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://example@o0.ingest.sentry.io/1';
    process.env.NEXT_PUBLIC_APP_ENV = 'staging';
    const sentry = jest.mocked(await import('@sentry/nextjs'));

    await import('../instrumentation-client');

    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://example@o0.ingest.sentry.io/1',
        environment: 'staging',
        tracesSampleRate: 0.1,
      }),
    );
  });
});
