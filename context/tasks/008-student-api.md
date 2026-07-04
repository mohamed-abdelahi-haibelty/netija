# 008 — Student Result API

**Depends on:** 007
**Context:** architecture.md (minimal model), project-overview.md (student page).

## Goal
The endpoint powering a single result page: one attempt, shown on its own.

## Requirements
- A result is a single attempt. The endpoint returns one attempt identified by
  exam_year + exam_no (the pair is unique), or by attempt id — match whatever
  the search results link to.
- Returns: name (fr and ar if kept), exam_year, exam_no, serie, decision
  (normalized; raw available), moyenne, and optional school/wilaya if still stored.
- Only attempts from published years are returned; an attempt in an unpublished
  year is a 404 publicly.
- No person aggregation, no multi-attempt history on this endpoint, no see-also.
- Cached (Redis) with an invalidation contract callable by the publish flow.

## Out of scope
- Showing a name's other years (that lives in search results, task 009), admin
  preview of unpublished data (022).

## Done when
- [ ] Tests: valid published attempt returns the correct payload; unpublished →
      404; unknown → 404; cache hit avoids the DB on second call.
