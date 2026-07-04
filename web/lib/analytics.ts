'use client';

import posthog from 'posthog-js';

// Anonymous-only PostHog wiring (error-handling.md / architecture.md
// invariant 7: no PII in PostHog events). Inert whenever
// NEXT_PUBLIC_POSTHOG_KEY is absent (local/test never talks to PostHog),
// proven by tests instead of a guard at every call site below.
function isEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);
}

let initialized = false;

export function initAnalytics(): void {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || initialized) return;
  initialized = true;
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
  });
}

function capture(event: string, properties?: Record<string, unknown>): void {
  if (!isEnabled()) return;
  posthog.capture(event, properties);
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

export function trackResultSearched(method: 'examNo' | 'name'): void {
  capture('result_searched', { method });
}

export function trackAutocompleteShown(count: number, queryLength: number): void {
  capture('autocomplete_shown', { count, queryLength });
}

export function trackAutocompleteEmpty(queryLength: number): void {
  capture('autocomplete_empty', { queryLength });
}

// searchAttempts: how many searches (exam-number submissions or
// autocomplete picks) the user made this session before landing on this
// result — a friction signal, never row content.
export function trackResultOpened(searchAttempts: number): void {
  capture('result_opened', { searchAttempts });
}

export function trackAdminUploadStarted(): void {
  capture('admin_upload_started');
}

export function trackAdminUploadCompleted(): void {
  capture('admin_upload_completed');
}

export function trackAdminPublish(action: 'publish' | 'unpublish'): void {
  capture('admin_publish', { action });
}
