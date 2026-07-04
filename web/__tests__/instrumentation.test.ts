export {};

jest.mock('@sentry/nextjs', () => ({
  init: jest.fn(),
  captureRequestError: jest.fn(),
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('server/edge instrumentation (error-handling.md: first-import Sentry init)', () => {
  it('never initializes Sentry without SENTRY_DSN', async () => {
    delete process.env.SENTRY_DSN;
    jest.resetModules();
    const sentry = jest.mocked(await import('@sentry/nextjs'));
    const { register } = await import('../instrumentation');

    register();

    expect(sentry.init).not.toHaveBeenCalled();
  });

  it('initializes with a low trace sample rate and the environment tag when SENTRY_DSN is set', async () => {
    process.env.SENTRY_DSN = 'https://example@o0.ingest.sentry.io/1';
    process.env.APP_ENV = 'staging';
    jest.resetModules();
    const sentry = jest.mocked(await import('@sentry/nextjs'));
    const { register } = await import('../instrumentation');

    register();

    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://example@o0.ingest.sentry.io/1',
        environment: 'staging',
        tracesSampleRate: 0.1,
      }),
    );
  });

  it('onRequestError forwards to Sentry.captureRequestError', async () => {
    jest.resetModules();
    const sentry = jest.mocked(await import('@sentry/nextjs'));
    const { onRequestError } = await import('../instrumentation');
    const err = new Error('boom');
    const request = { path: '/api/search/exam', method: 'GET', headers: {} };
    const context = { routerKind: 'App Router', routePath: '/api/search/exam', routeType: 'route' } as never;

    void onRequestError(err, request, context);

    expect(sentry.captureRequestError).toHaveBeenCalledWith(err, request, context);
  });
});
