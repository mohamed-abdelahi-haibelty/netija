# 009 — Meilisearch Indexing & Name Search API

**Depends on:** 007
**Context:** architecture.md (Meilisearch as derived index, disambiguators), project-overview.md (autocomplete behavior).

## Goal
Typo-tolerant name autocomplete: the index builder and the public search endpoint.

## Requirements
- Index builder: indexes persons having at least one published attempt, as documents carrying person id, both names, and the disambiguators (latest year, serie, birth place when present). Searchable on both names; full rebuild command exists; the post-import/publish contract is a rebuild or batched sync.
- Search endpoint: query of at least 2 characters (validated), returns at most 10 persons sorted most-recent-first, supporting French and Arabic input.
- Responses carry the disambiguators so the UI can render distinguishable suggestions.

## Out of scope
- Frontend combobox (011); reindex triggering from the pipeline (019/022 wire it).

## Done when
- [ ] Index-builder test: seeded data produces the expected documents (unpublished-only persons excluded).
- [ ] Endpoint tests (Meili client mocked): validation, limit of 10, response shape with disambiguators.
- [ ] Manual check against the real local Meilisearch: an Arabic query and a typo'd French query both return the seeded person.
