import * as Sentry from '@sentry/nextjs';
import type { Instrumentation } from 'next';
import { scrubPii } from '@/lib/sentryScrub';

// Server/edge Sentry init (error-handling.md's Sentry Configuration): runs
// once before the server handles its first request, in both the nodejs and
// edge runtimes. Inert unless SENTRY_DSN is set — local/test never talks to
// Sentry, proven by tests instead of a guard at every capture call site.
export function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.APP_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    beforeSend: scrubPii,
  });
}

// Captures unexpected SSR/RSC/route-handler errors (error-handling.md's
// frontend rule: "unexpected fetch failures ... captured by Sentry via
// @sentry/nextjs") — the same errors the route-level error.tsx boundaries
// render for the user, with the request path/method as context.
export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  Sentry.captureRequestError(err, request, context);
};
