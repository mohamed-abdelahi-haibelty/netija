import { scrubPii } from '@/lib/sentryScrub';

// Browser Sentry init (error-handling.md's Sentry Configuration). Only
// NEXT_PUBLIC_* vars reach the browser (architecture.md invariant 4), so
// this uses its own public DSN/environment vars rather than the server's.
// Inert unless NEXT_PUBLIC_SENTRY_DSN is set — local/test never talks to
// Sentry, proven by tests instead of a guard at every capture call site.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// @sentry/nextjs's browser SDK is ~130 KiB gzipped. This file used to
// import it statically, which put the whole SDK in the eager script every
// route loads before hydration (PageSpeed flagged it as most of both
// "reduce unused javascript" and "legacy javascript" on the home page,
// and it's a strong candidate for the long main-thread task around
// hydration — Sentry.init() patches fetch/XHR/console/history). Same fix
// as PostHog (lib/analytics.ts, code-standards.md: "no blocking
// third-party scripts"): a dynamic import splits it into its own chunk
// that's only fetched after `load`, well past hydration — real unexpected
// errors (error-handling.md) are still overwhelmingly post-load (network
// failures, interaction bugs), so this trades early-hydration-crash
// coverage, which route-level error.tsx already renders regardless, for
// keeping Sentry off every visitor's critical path.
if (dsn) {
  window.addEventListener('load', () => {
    void import('@sentry/nextjs').then(({ init }) => {
      init({
        dsn,
        environment: process.env.NEXT_PUBLIC_APP_ENV ?? 'development',
        tracesSampleRate: 0.1,
        beforeSend: scrubPii,
      });
    });
  });
}
