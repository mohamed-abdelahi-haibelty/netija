import * as Sentry from '@sentry/nextjs';
import { scrubPii } from '@/lib/sentryScrub';

// Browser Sentry init (error-handling.md's Sentry Configuration). Only
// NEXT_PUBLIC_* vars reach the browser (architecture.md invariant 4), so
// this uses its own public DSN/environment vars rather than the server's.
// Inert unless NEXT_PUBLIC_SENTRY_DSN is set — local/test never talks to
// Sentry, proven by tests instead of a guard at every capture call site.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? 'development',
    tracesSampleRate: 0.1,
    beforeSend: scrubPii,
  });
}
