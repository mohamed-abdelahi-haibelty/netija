import posthog from 'posthog-js';
import {
  trackResultSearched,
  trackAutocompleteShown,
  trackAutocompleteEmpty,
  trackResultOpened,
  trackAdminUploadStarted,
  trackAdminUploadCompleted,
  trackAdminPublish,
  recordSearchAttempt,
  consumeSearchAttempts,
  initAnalytics,
} from '../analytics';

jest.mock('posthog-js', () => ({
  __esModule: true,
  default: { init: jest.fn(), capture: jest.fn() },
}));

// posthog-js's real .d.ts declares capture/init with method shorthand,
// which trips @typescript-eslint/unbound-method the moment a mocked
// instance's method is passed to `expect()` by reference. Asserting to a
// plain function-property shape (not a method signature) sidesteps that —
// the mock itself is unaffected, only the static type used to read it here.
const mockPosthog = posthog as unknown as { init: jest.Mock; capture: jest.Mock };

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
  window.sessionStorage.clear();
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('track* helpers (error-handling.md / architecture.md invariant 7: no PII)', () => {
  it('never call posthog.capture when NEXT_PUBLIC_POSTHOG_KEY is absent', () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;

    trackResultSearched('examNo');
    trackAutocompleteShown(3, 5);
    trackAutocompleteEmpty(2);
    trackResultOpened(2);
    trackAdminUploadStarted();
    trackAdminUploadCompleted();
    trackAdminPublish('publish');

    expect(mockPosthog.capture).not.toHaveBeenCalled();
  });

  it('fires each agreed event with a PII-free, shapes-and-counts-only payload when enabled', () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test123';

    trackResultSearched('examNo');
    expect(mockPosthog.capture).toHaveBeenCalledWith('result_searched', { method: 'examNo' });

    trackResultSearched('name');
    expect(mockPosthog.capture).toHaveBeenCalledWith('result_searched', { method: 'name' });

    trackAutocompleteShown(3, 5);
    expect(mockPosthog.capture).toHaveBeenCalledWith('autocomplete_shown', {
      count: 3,
      queryLength: 5,
    });

    trackAutocompleteEmpty(2);
    expect(mockPosthog.capture).toHaveBeenCalledWith('autocomplete_empty', { queryLength: 2 });

    trackResultOpened(4);
    expect(mockPosthog.capture).toHaveBeenCalledWith('result_opened', { searchAttempts: 4 });

    trackAdminUploadStarted();
    expect(mockPosthog.capture).toHaveBeenCalledWith('admin_upload_started', undefined);

    trackAdminUploadCompleted();
    expect(mockPosthog.capture).toHaveBeenCalledWith('admin_upload_completed', undefined);

    trackAdminPublish('unpublish');
    expect(mockPosthog.capture).toHaveBeenCalledWith('admin_publish', { action: 'unpublish' });

    // Never a name, exam number, NNI, or result value anywhere in an argument.
    for (const call of mockPosthog.capture.mock.calls) {
      expect(JSON.stringify(call)).not.toMatch(/Mohamed|Fatimetou|Admis|Ajourn/i);
    }
  });
});

describe('search-attempt counter (result_opened friction signal)', () => {
  it('increments per recordSearchAttempt and resets once consumed', () => {
    recordSearchAttempt();
    recordSearchAttempt();
    recordSearchAttempt();

    expect(consumeSearchAttempts()).toBe(3);
    // Consuming resets the counter; the next search sequence starts fresh
    // (falling back to 1 — the one attempt that must have just happened).
    expect(consumeSearchAttempts()).toBe(1);
  });
});

describe('initAnalytics', () => {
  it('never calls posthog.init without NEXT_PUBLIC_POSTHOG_KEY', () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;

    initAnalytics();

    expect(mockPosthog.init).not.toHaveBeenCalled();
  });

  it('initializes anonymous-only, with autocapture and session recording off', () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test123';
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://example.posthog.com';

    initAnalytics();

    expect(mockPosthog.init).toHaveBeenCalledWith(
      'phc_test123',
      expect.objectContaining({
        api_host: 'https://example.posthog.com',
        person_profiles: 'identified_only',
        autocapture: false,
        disable_session_recording: true,
      }),
    );
  });
});
