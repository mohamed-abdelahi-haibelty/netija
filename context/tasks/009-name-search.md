# 009 — Name Search API (grouped by year)

**Depends on:** 007
**Context:** architecture.md (Meilisearch as derived index), project-overview.md (name search behavior).

## Goal
Global, typo-tolerant name search where each matching ATTEMPT appears as its own
year-labeled suggestion — no identity linking, no merged persons.

## Requirements
- Index builder: index one document PER PUBLISHED ATTEMPT (not per person),
  each carrying attempt id / (exam_year, exam_no), name, exam_year, serie.
  Rebuildable from Postgres; only published years indexed.
- Search endpoint: query >= 2 chars, typo-tolerant, French and Arabic input,
  returns up to ~10 matching attempts.
- Ordering: results for the same/similar name are returned newest year first,
  so a name that appears in 2025, 2024, 2023 shows those as three separate
  rows, latest at top. Each row carries year + serie so the user can pick.
- No claim that same-name rows are the same person — they are independent
  results that happen to share a name.

## Out of scope
- The autocomplete UI (011); reindex triggering from the pipeline (022 wires it).

## Done when
- [ ] Index builder test: a name appearing in 3 years produces 3 documents.
- [ ] Endpoint tests (Meili mocked): validation, limit, newest-first ordering,
      each row carries year + serie.
- [ ] Manual check on real local Meilisearch: an Arabic query and a typo'd
      French query both return the expected attempts.
