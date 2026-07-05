import * as Sentry from '@sentry/node';

// First-import pattern (error-handling.md's Sentry Configuration): server.ts
// and queueWorker.ts import this module before anything else so Sentry's
// automatic instrumentation can patch node's http/pg/etc. modules before
// the app's own imports touch them. Absent SENTRY_DSN (local/test), Sentry
// is never initialized — every SDK call becomes a no-op against the
// default no-op client, proven by tests instead of an explicit guard at
// every call site.
const dsn = process.env['SENTRY_DSN'];

if (dsn) {
  Sentry.init({
    dsn,
    // production/staging only — never paged by local/dev noise.
    environment: process.env['APP_ENV'] ?? process.env['NODE_ENV'] ?? 'development',
    tracesSampleRate: 0.1,
    beforeSend: scrubPii,
  });
}

// Defensive scrub (error-handling.md: "beforeSend scrubs known PII fields
// defensively even though none should be present"). Our own call sites only
// ever pass requestId/importId as context, but Sentry's http integration
// auto-captures the request URL, query string, and cookies — any of which
// could carry an exam number (?no=...) or a session token. Strip that
// automatically-attached data rather than trust every current and future
// route to never leak it.
export function scrubPii(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
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
