# 022 — Publish Flow & Smoke Verification

**Depends on:** 020, 009
**Context:** project-overview.md (results-day pipeline), architecture.md, testing.md.

## Goal
Imports land unpublished, an automated check proves correctness, going live is
one reversible click. No linking step in the pipeline.

## Requirements
- The published flag enforced everywhere public: exam search, result API, name
  search / Meilisearch indexing all exclude unpublished years; auth-gated admin
  preview can see unpublished data.
- Pipeline per import: clean -> load attempts -> Meilisearch index (attempts).
  There is NO linking pass.
- Smoke verification: sample >=20 random imported attempts, assert the admin
  preview returns matching name, exam_no, moyenne, decision; reconcile totals
  (file rows = inserted + rejected). Result stored on the import; a deliberate
  mismatch proves it fails loudly.
- Publish endpoint: blocked until smoke passes; on success atomically flips
  visibility, triggers Meilisearch sync for the year, invalidates the Redis
  cache, fires the Cloudflare purge hook. Unpublish reverts.
- Dashboard controls show smoke status and publish/unpublish per year.

## Out of scope
- Rate limiting (025); any identity linking (removed).

## Done when
- [ ] Tests: unpublished invisibility vs admin visibility; publish gating;
      visibility flip; purge hook fires; unpublish reversal; smoke mismatch
      failure.
