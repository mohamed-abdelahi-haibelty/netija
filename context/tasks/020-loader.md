# 020 — The Loader (Python -> Postgres)

**Depends on:** 017, 019
**Context:** architecture.md (idempotency, transaction, speed budget), error-handling.md, testing.md.

## Goal
Cleaned rows become attempt rows — fast, transactional, idempotent. No persons,
no linking.

## Requirements
- End to end for one import: read -> map -> clean -> load attempts, in a single
  transaction (a mid-import failure leaves no partial year).
- Batched loading (bulk copy / batched inserts), within the <2-minute 50k budget.
- Idempotent against UNIQUE (exam_year, exam_no): re-running the same import
  changes nothing and reports it.
- Rejected rows recorded with row number, reason, offending column; downloadable
  reject report via an auth-protected endpoint.
- stdout JSON summary: inserted, rejected, duplicates_skipped. (No new_people —
  that concept is gone.)
- File-level failures (unreadable, floor violation post-mapping) fail the job
  with a precise reason.

## Out of scope
- Any linking (removed), publish (022), Meilisearch (wired in 022).

## Done when
- [ ] Tests vs disposable Postgres: every fixture loads with expected counts;
      loading twice yields zero new rows and says so; rejects recorded with
      reasons and served by the report endpoint; a forced mid-load failure
      leaves the DB untouched.
