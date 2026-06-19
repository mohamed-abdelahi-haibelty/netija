# 004 — Hono API Skeleton

**Depends on:** 003
**Context:** architecture.md (boundaries, invariants 1–3), error-handling.md (this task implements its API rules), code-standards.md (API routes), testing.md.

## Goal
A running Hono API with the app/server split, baseline middleware, central error handling, and health endpoints — the foundation every route task builds on.

## Requirements
- App is exported separately from the server entry (testable via `app.request()`).
- Baseline middleware: request id on every response, structured request logging, secure headers, CORS allowing the web app origin.
- Central error handling exactly per error-handling.md: standard error shape, HTTPException pass-through, generic 500 for unexpected errors (no internals leaked), custom 404.
- `/health` (liveness, no dependencies) and `/health/ready` (real Postgres, Redis, Meilisearch checks; 503 with per-dependency booleans when degraded).
- Vitest configured for the api package.

## Out of scope
- Business routes, auth, rate limiting, Sentry wiring (026).

## Done when
- [ ] Tests: health 200; ready 503 with correct booleans when a dependency is unreachable; unknown route returns the standard 404 shape; a deliberately thrown error returns the standard 500 shape with no internal message; every response carries a request id.
