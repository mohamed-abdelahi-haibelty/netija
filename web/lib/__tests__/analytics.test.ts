import posthog from 'posthog-js';
import {
  trackResultSearched,
  trackAutocompleteShown,
  trackAutocompleteEmpty,
  trackResultOpened,
  trackUploadStarted,
  trackUploadCompleted,
  trackPublish,
  trackAdminAccessAttempt,
  recordSearchAttempt,
  consumeSearchAttempts,
  initAnalytics,
  capturePageview,
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

    trackResultSearched('exam_no', { found: true, year: 2024, examType: 'bac' });
    trackAutocompleteShown(3, 5, 'bac');
    trackAutocompleteEmpty(2, 'bac');
    trackResultOpened(2, 'bac', 'SN');
    trackUploadStarted('bac');
    trackUploadCompleted({ rowCount: 100, rejected: 3, durationMs: 4200, examType: 'bac' });
    trackPublish({ examType: 'bac', examYear: 2024, attemptCount: 97 });
    trackAdminAccessAttempt('/admin/imports/[id]');
    capturePageview('/fr/results/abc', '');

    expect(mockPosthog.capture).not.toHaveBeenCalled();
  });

  it('fires each agreed event with a PII-free, shapes-and-counts-only payload when enabled', () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test123';

    trackResultSearched('exam_no', { found: true, year: 2024, examType: 'bac' });
    expect(mockPosthog.capture).toHaveBeenCalledWith('result_searched', {
      method: 'exam_no',
      found: true,
      exam_type: 'bac',
      year: 2024,
    });

    trackResultSearched('exam_no', { found: false, year: 2023, examType: 'brevet' });
    expect(mockPosthog.capture).toHaveBeenCalledWith('result_searched', {
      method: 'exam_no',
      found: false,
      exam_type: 'brevet',
      year: 2023,
    });

    // Name searches never carry a year.
    trackResultSearched('name', { found: true, examType: 'brevet' });
    expect(mockPosthog.capture).toHaveBeenCalledWith('result_searched', {
      method: 'name',
      found: true,
      exam_type: 'brevet',
    });

    trackAutocompleteShown(3, 5, 'bac');
    expect(mockPosthog.capture).toHaveBeenCalledWith('autocomplete_shown', {
      count: 3,
      query_length: 5,
      exam_type: 'bac',
    });

    trackAutocompleteEmpty(2, 'brevet');
    expect(mockPosthog.capture).toHaveBeenCalledWith('autocomplete_empty', {
      query_length: 2,
      exam_type: 'brevet',
    });

    trackResultOpened(4, 'brevet');
    expect(mockPosthog.capture).toHaveBeenCalledWith('result_opened', {
      searches_before_success: 4,
      exam_type: 'brevet',
    });

    // serie is a safe categorical, added only for Bac (Brevet has no track).
    trackResultOpened(1, 'bac', 'SN');
    expect(mockPosthog.capture).toHaveBeenCalledWith('result_opened', {
      searches_before_success: 1,
      exam_type: 'bac',
      serie: 'SN',
    });

    trackUploadStarted('bac');
    expect(mockPosthog.capture).toHaveBeenCalledWith('upload_started', { exam_type: 'bac' });

    trackUploadCompleted({ rowCount: 5000, rejected: 20, durationMs: 12345, examType: 'brevet' });
    expect(mockPosthog.capture).toHaveBeenCalledWith('upload_completed', {
      row_count: 5000,
      rejected: 20,
      duration_ms: 12345,
      exam_type: 'brevet',
    });

    trackPublish({ examType: 'bac', examYear: 2024, attemptCount: 4980 });
    expect(mockPosthog.capture).toHaveBeenCalledWith('publish', {
      exam_type: 'bac',
      exam_year: 2024,
      attempt_count: 4980,
    });

    trackAdminAccessAttempt('/admin/imports/[id]/mapping');
    expect(mockPosthog.capture).toHaveBeenCalledWith('admin_access_attempt', {
      route: '/admin/imports/[id]/mapping',
    });

    // Never a name, exam number, NNI, or result value anywhere in an argument.
    for (const call of mockPosthog.capture.mock.calls) {
      expect(JSON.stringify(call)).not.toMatch(/Mohamed|Fatimetou|Admis|Ajourn/i);
    }
  });
});

describe('capturePageview', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test123';
  });

  it('captures a $pageview with the current URL and, for a locale-prefixed path, the active locale', () => {
    capturePageview('/fr/results/abc123', 'utm_source=tiktok');

    expect(mockPosthog.capture).toHaveBeenCalledWith('$pageview', {
      $current_url: `${window.location.origin}/fr/results/abc123?utm_source=tiktok`,
      locale: 'fr',
    });
  });

  it('extracts the locale from admin paths too', () => {
    capturePageview('/admin/ar/imports', '');

    expect(mockPosthog.capture).toHaveBeenCalledWith('$pageview', {
      $current_url: `${window.location.origin}/admin/ar/imports`,
      locale: 'ar',
    });
  });

  it('omits locale when the path has none recognizable', () => {
    capturePageview('/', '');

    expect(mockPosthog.capture).toHaveBeenCalledWith('$pageview', {
      $current_url: `${window.location.origin}/`,
    });
  });

  it('never captures without a PostHog key', () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    capturePageview('/fr', '');
    expect(mockPosthog.capture).not.toHaveBeenCalled();
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

  it('initializes anonymous-only, with autocapture/session recording off and manual pageview capture', () => {
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
        capture_pageview: false,
        capture_pageleave: true,
      }),
    );
  });
});
