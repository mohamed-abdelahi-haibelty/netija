'use client';

import type { PostHog } from 'posthog-js';
import { hasLocale, type Locale } from '@/lib/i18n/settings';
import type { ExamType } from 'shared';

let initialized = false;
// posthog-js is ~50 KiB gzipped and was previously a static import here,
// which pulled it into every route's initial JS bundle even though it's
// only ever used after mount (PageSpeed flagged this as both "legacy
// javascript" and "reduce unused javascript"). A dynamic import keeps it out
// of the critical bundle entirely.
let posthogPromise: Promise<PostHog> | null = null;

// Lazily loads and initializes posthog-js exactly once (memoized on
// posthogPromise), kicked off by whichever comes first: AnalyticsInit's
// mount-time initAnalytics() call, or the first capture()/capturePageview()
// call. Making capture() self-sufficient — rather than requiring
// initAnalytics() to have already run — avoids any dependency on component
// mount order.
function loadPosthog(key: string): Promise<PostHog> {
  if (posthogPromise) return posthogPromise;
  initialized = true;
  posthogPromise = import('posthog-js').then(({ default: posthog }) => {
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
      // No identify() call exists anywhere in this app, so every visitor
      // stays anonymous — 'identified_only' means PostHog never creates a
      // full person profile for them (the analytics plan's "profiles for
      // identified only").
      person_profiles: 'identified_only',
      // Only the agreed event set below is ever sent — never raw DOM
      // interactions, which could capture rendered PII (e.g. a name in a
      // clicked element's text).
      autocapture: false,
      // A result page can render a real name; never risk it in a replay.
      disable_session_recording: true,
      // App Router navigations don't reload the page, so pageviews are fired
      // manually by <PostHogPageview> instead (capturePageview below) — this
      // is also what lets each one carry the active locale.
      capture_pageview: false,
      // Still emit $pageleave, which PostHog's session-duration and
      // pages-per-session insights rely on alongside the manual pageviews.
      capture_pageleave: true,
    });
    return posthog;
  });
  return posthogPromise;
}

// Anonymous-only PostHog wiring (error-handling.md / architecture.md
// invariant 7: no PII in PostHog events). Inert whenever
// NEXT_PUBLIC_POSTHOG_KEY is absent (local/test never talks to PostHog),
// proven by tests instead of a guard at every call site below.
export function initAnalytics(): void {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || initialized) return;
  void loadPosthog(key);
}

function capture(event: string, properties?: Record<string, unknown>): void {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  void loadPosthog(key).then((posthog) => posthog.capture(event, properties));
}

// Test-only: resets the module-level lazy-load state so each test starts
// fresh (testing.md: "fresh state in beforeEach; no test depends on
// another's side effects"). Never called from application code.
export function __resetAnalyticsForTests(): void {
  initialized = false;
  posthogPromise = null;
}

function extractLocale(pathname: string): Locale | null {
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0] === 'admin' ? segments[1] : segments[0];
  return first && hasLocale(first) ? first : null;
}

// Fired once per client-side navigation by <PostHogPageview> (mounted in the
// root layout). Manual capture — not autocapture's pageview listener —
// because it's the only way to attach `locale` to every $pageview.
// Referrer, UTM params, device, browser, etc. are still enriched
// automatically by posthog-js's own event pipeline regardless of how the
// capture was triggered.
export function capturePageview(pathname: string, search: string): void {
  const url = `${window.location.origin}${pathname}${search ? `?${search}` : ''}`;
  const locale = extractLocale(pathname);
  capture('$pageview', {
    $current_url: url,
    ...(locale ? { locale } : {}),
  });
}

const SEARCH_ATTEMPTS_KEY = 'netija:searchAttempts';

// Counts searches (exam-number submissions, autocomplete picks) within this
// browser session, so `result_opened` can report how many it took before
// success — a friction signal, never row content. sessionStorage (not
// state) because the counter must survive the client-side navigation from
// the search form to the result page.
export function recordSearchAttempt(): void {
  if (typeof window === 'undefined') return;
  const current = Number(window.sessionStorage.getItem(SEARCH_ATTEMPTS_KEY) ?? '0');
  window.sessionStorage.setItem(SEARCH_ATTEMPTS_KEY, String(current + 1));
}

// Reads and resets the counter — called once when a result page mounts, so
// the next search sequence starts counting fresh.
export function consumeSearchAttempts(): number {
  if (typeof window === 'undefined') return 1;
  const current = Number(window.sessionStorage.getItem(SEARCH_ATTEMPTS_KEY) ?? '0');
  window.sessionStorage.removeItem(SEARCH_ATTEMPTS_KEY);
  return current || 1;
}

interface ResultSearchedOptions {
  found: boolean;
  // Exam-number searches only — name searches have no year on their own.
  year?: number;
  // 'bac' | 'brevet' — a safe categorical, so usage can be split per exam type.
  examType: ExamType;
}

export function trackResultSearched(
  method: 'name' | 'exam_no',
  { found, year, examType }: ResultSearchedOptions,
): void {
  capture('result_searched', {
    method,
    found,
    exam_type: examType,
    ...(year !== undefined ? { year } : {}),
  });
}

export function trackAutocompleteShown(count: number, queryLength: number, examType: ExamType): void {
  capture('autocomplete_shown', { count, query_length: queryLength, exam_type: examType });
}

export function trackAutocompleteEmpty(queryLength: number, examType: ExamType): void {
  capture('autocomplete_empty', { query_length: queryLength, exam_type: examType });
}

// searchesBeforeSuccess: how many searches (exam-number submissions or
// autocomplete picks) the user made this session before landing on this
// result — a friction signal, never row content. serie (e.g. 'SN', 'LM') is
// a safe categorical for audience mix, added only when the result page
// knows it.
export function trackResultOpened(
  searchesBeforeSuccess: number,
  examType: ExamType,
  serie?: string,
): void {
  capture('result_opened', {
    searches_before_success: searchesBeforeSuccess,
    exam_type: examType,
    ...(serie ? { serie } : {}),
  });
}

// Fired when an admin confirms the column mapping and the import pipeline
// actually starts processing rows — nothing about row counts is known
// before that point, so this event carries no properties.
export function trackUploadStarted(examType: ExamType): void {
  capture('upload_started', { exam_type: examType });
}

interface UploadCompletedProps {
  rowCount: number;
  rejected: number;
  durationMs: number;
  // null when an older import row has no recorded type (pre-Brevet uploads).
  examType: ExamType | null;
}

export function trackUploadCompleted({ rowCount, rejected, durationMs, examType }: UploadCompletedProps): void {
  capture('upload_completed', {
    row_count: rowCount,
    rejected,
    duration_ms: durationMs,
    ...(examType ? { exam_type: examType } : {}),
  });
}

interface PublishProps {
  examType: ExamType | null;
  examYear: number;
  attemptCount: number;
}

// attemptCount: rows published (ImportSummary.inserted) — never any
// individual row's content.
export function trackPublish({ examType, examYear, attemptCount }: PublishProps): void {
  capture('publish', {
    ...(examType ? { exam_type: examType } : {}),
    exam_year: examYear,
    attempt_count: attemptCount,
  });
}

// route: an admin path *pattern* (e.g. '/admin/imports/[id]/mapping') —
// never a query string or anything else that could carry personal data.
export function trackAdminAccessAttempt(route: string): void {
  capture('admin_access_attempt', { route });
}
