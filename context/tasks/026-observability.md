# 026 — Observability: Sentry, PostHog, Logging

**Depends on:** 004, 005, 019
**Context:** architecture.md (invariant 7 — no PII), error-handling.md (Sentry config, logging conventions).

## Goal

Knowing what breaks and how the product is used — without ever collecting personal data.

## Requirements

- Sentry in all three runtimes (web, api, worker): environment-tagged (`production`, unset/local in dev), initialized per error-handling.md (first-import pattern on the API), low trace sampling, capturing only unexpected errors via the existing central handlers, with request/import identifiers as context and a defensive PII scrub.
- PostHog (browser only): anonymous-only configuration per the analytics plan — no `identify()` calls, profiles for identified only; autocapture and session recording off; loaded without blocking rendering; inert whenever `NEXT_PUBLIC_POSTHOG_KEY` is absent. The full event set (see project-overview.md's Analytics section for the authoritative list and payload shapes):
  - Automatic: pageviews (captured manually per client-side route change so `locale` can be attached — App Router navigations don't reload the page), enriched by posthog-js with referrer, UTM parameters, device/browser/region — no custom event needed for any of this, and Cloudflare doesn't strip any of it (computed client-side).
  - Search & discovery: `result_searched` (`method`, `year?`, `found`), `autocomplete_shown` (`count`, `query_length`), `autocomplete_empty` (`query_length`), `result_opened` (`searches_before_success`, `serie?`).
  - Admin/pipeline: `upload_started` (no properties — fired at mapping confirm, before row counts exist), `upload_completed` (`row_count`, `rejected`, `duration_ms` — duration observed client-side by the imports dashboard), `publish` (`exam_year`, `attempt_count`; unpublish isn't tracked), `admin_access_attempt` (`route` pattern — fired from the login page when the (shell) layout redirects an unauthenticated `/admin/*` visit there; direct hits on a protected admin API with no browser page load aren't covered by browser-only PostHog and instead stay visible via the existing 401 + structured warn log).
  - Every property is a shape, count, or safe categorical — never a name, exam number, NNI, birth data, or result value.
- Structured JSON logging in production per the conventions: levels used as defined, identifiers not content.
- Local/test environments: both SDKs inert (no network), proven by tests.

## Out of scope

- Dashboards/alerts inside the SaaS tools (documented pointers only).
- Server-side PostHog capture (e.g. via posthog-node) for `admin_access_attempt` on direct, browser-less hits to protected admin API routes — deliberately left to the existing 401 + structured warn log rather than adding a second server-side analytics SDK.

## Done when

- [x] Tests: an unexpected API error reaches the mocked Sentry capture with request id and without PII; expected errors (404/400/429) do not; UI events fire with the asserted PII-free payloads; nothing initializes when keys are absent.
      (429/rate-limiting itself lands in task 025, not yet merged to main — it's an `HTTPException` like every other expected error, so it's already covered by the same `app.onError` branch this task tested and needs no additional code once merged.)
- [x] PostHog event set expanded to the richer, still-lean set above (search/discovery + admin/pipeline + admin_access_attempt); every event's payload asserted PII-free in tests; pageview capture switched to manual per-route-change so `locale` is attached and SPA navigations aren't missed.
