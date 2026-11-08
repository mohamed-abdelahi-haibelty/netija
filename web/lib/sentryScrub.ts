import type { ErrorEvent } from '@sentry/core';

// Defensive scrub (error-handling.md: "beforeSend scrubs known PII fields
// defensively even though none should be present"), shared by the browser
// and server/edge Sentry configs. Sentry's default integrations
// auto-capture the request URL, query string, and cookies — any of which
// could carry an exam number (?no=...) or a session token — strip that
// automatically-attached data rather than trust every current and future
// call site to never leak it.
export function scrubPii(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.query_string;
    delete event.request.cookies;
    delete event.request.data;
    if (event.request.headers) {
      delete event.request.headers['cookie'];
      delete event.request.headers['Cookie'];
    }
    if (event.request.url) {
      event.request.url = event.request.url.split('?')[0];
    }
  }
  return event;
}
