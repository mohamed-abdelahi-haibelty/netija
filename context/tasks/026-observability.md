# 026 — Observability: Sentry, PostHog, Logging

**Depends on:** 004, 005, 019
**Context:** architecture.md (invariant 7 — no PII), error-handling.md (Sentry config, logging conventions).

## Goal

Knowing what breaks and how the product is used — without ever collecting personal data.

## Requirements

- Sentry in all three runtimes (web, api, worker): environment-tagged (production/staging), initialized per error-handling.md (first-import pattern on the API), low trace sampling, capturing only unexpected errors via the existing central handlers, with request/import identifiers as context and a defensive PII scrub.
- PostHog (browser): anonymous-only configuration per the analytics plan — no identify calls, profiles for identified only; the agreed event set (result searched with method, autocomplete shown/empty with counts/lengths, result opened with a searches-before-success count — how many searches the user submitted in this session before opening a result, capturing search friction — plus admin upload started/completed and publish) — properties are shapes and counts, never names/exam numbers/results; loaded without blocking rendering.
- Structured JSON logging in production per the conventions: levels used as defined, identifiers not content.
- Local/test environments: both SDKs inert (no network), proven by tests.

## Out of scope

- Dashboards/alerts inside the SaaS tools (documented pointers only).

## Done when

- [x] Tests: an unexpected API error reaches the mocked Sentry capture with request id and without PII; expected errors (404/400/429) do not; UI events fire with the asserted PII-free payloads; nothing initializes when keys are absent.
      (429/rate-limiting itself lands in task 025, not yet merged to main — it's an `HTTPException` like every other expected error, so it's already covered by the same `app.onError` branch this task tested and needs no additional code once merged.)
