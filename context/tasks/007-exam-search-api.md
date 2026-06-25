# 007 — Exam-Number Search API

**Depends on:** 004, 006
**Context:** architecture.md (performance, published filtering), error-handling.md (codes), testing.md (required route tests + domain cases).

## Goal
The public endpoint that resolves an exam number + year to a student, with caching.

## Requirements
- Input: exam number (digit string, leading zeros significant — validated as digits, no fixed-length assumption) and exam year (must be a year that exists and is published). Validation per code-standards.md before any logic.
- Behavior: exact match within the given year; returns the linked person's identifier and summary, or STUDENT_NOT_FOUND (404). Unpublished years behave as if the data does not exist.
- An endpoint (or the same one) exposes the list of published years so the UI can populate its year selector with the latest as default.
- Redis cache-aside on lookups with a sensible TTL; a cache-invalidation contract callable by the import/publish flow later.
- Response shapes defined in `shared/` and consumed by the typed client.

## Out of scope
- Rate limiting (025), admin preview of unpublished data (022).

## Done when
- [ ] Tests: happy path; malformed number → 400; unknown number → 404; same exam number in two seeded years returns two different people; unpublished year → 404; second identical call is served from cache (no DB query — assert via call counting).
