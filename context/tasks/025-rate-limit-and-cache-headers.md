# 025 — Rate Limiting & Cache Headers

**Depends on:** 007–009, 022
**Context:** architecture.md (performance architecture), error-handling.md (RATE_LIMITED), testing.md (429 case).

## Goal
Spike protection inside the app and correct cacheability signals for the edge.

## Requirements
- Redis-backed fixed-window rate limiting on the public search and student endpoints; health endpoints and authenticated admin routes exempt.
- Client identification prefers the Cloudflare-provided real-IP header with a sane fallback; limits and window are named constants with documented values.
- Exceeding the limit returns the standard RATE_LIMITED error with a Retry-After header; standard rate-limit info headers on responses.
- Cache-Control headers per route class per architecture.md: short TTLs on public search responses, longer on student pages, no-store on admin/auth routes — consistent with the publish-time purge from 022.
- Frontend renders the rate-limited state per error-handling.md.

## Out of scope
- Cloudflare dashboard configuration (documented in 029).

## Done when
- [ ] Tests: requests over the limit → 429 with Retry-After; counters keyed by client identity; exempt routes unaffected; header values per route class asserted.
