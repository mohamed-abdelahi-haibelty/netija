# 003 — Database Schema & Migrations

**Depends on:** 002
**Context:** architecture.md (storage model + data-model invariants — this task implements them).

## Goal
The full Drizzle schema and first migration for the attempt-first identity model and the import pipeline bookkeeping.

## Requirements
- Tables: attempts, persons, person_links, link_suggestions, imports, rejects, column_aliases (Better Auth tables arrive in task 013).
- attempts: immutable sittings — exam_year, exam_no (TEXT, leading zeros preserved), nni (TEXT, nullable), name_fr, name_ar, birth_date, birth_place, serie, moyenne (numeric out of 20), decision (normalized), decision_raw, optional school/wilaya fields, match_key (nullable), import_id.
- Constraints/indexes per architecture.md: UNIQUE (exam_year, exam_no); UNIQUE person_links.attempt_id; indexes on nni, match_key, person_links.person_id.
- imports: file metadata, status lifecycle, summary counts, smoke result, published flag per exam year, failure reason.
- link_suggestions: attempt/person pair, reason, status (pending/accepted/rejected), resolution audit fields.
- Migration applies cleanly to an empty database; drizzle-kit configured.

## Out of scope
- Any query logic, seeding (006), auth tables (013).

## Done when
- [ ] Migration runs on a fresh database without errors; re-running is a no-op.
- [ ] Tests prove the uniqueness constraints reject duplicates (same year+exam_no; second link for one attempt).
- [ ] Drizzle types compile and are importable from api code.
