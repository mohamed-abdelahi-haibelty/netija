/**
 * Shared `jest.mock('@/lib/api', ...)` factory piece, used by every test
 * that mocks the api client at the boundary. Only builds the
 * MockApiClientError class (+ optional DEFAULT_RATE_LIMIT_RETRY_SECONDS) —
 * each test file still defines its own `apiRequest` forwarder inline,
 * closing over its own local `mockApiRequest`, so that reference stays
 * lazy (deferred until actually called) instead of being evaluated eagerly
 * as an argument here, which would risk a TDZ error: jest.mock() factories
 * can run as soon as any earlier import resolves '@/lib/api', which is
 * before a same-file `const mockApiRequest = jest.fn()` has executed.
 *
 * Referenced from inside a `jest.mock()` callback, so its imported name
 * must start with "mock" (case-insensitive) for babel-plugin-jest-hoist's
 * out-of-scope-variable check to allow it — see each test file's import
 * alias — and its own import must appear before any import that resolves
 * '@/lib/api', so the binding is initialized by the time the factory runs.
 */
export function mockApiModule(withRateLimitRetry = false) {
  class MockApiClientError extends Error {
    code: string;
    retryAfterSeconds?: number;
    constructor(code: string, message: string, retryAfterSeconds?: number) {
      super(message);
      this.code = code;
      this.retryAfterSeconds = retryAfterSeconds;
      this.name = 'ApiClientError';
    }
  }
  return {
    ApiClientError: MockApiClientError,
    ...(withRateLimitRetry ? { DEFAULT_RATE_LIMIT_RETRY_SECONDS: 60 } : {}),
  };
}
