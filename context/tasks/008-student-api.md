# 008 — Student Page API

**Depends on:** 007
**Context:** architecture.md (linking model), project-overview.md (student page + see-also behavior).

## Goal
The endpoint powering the student page: one person, all their attempts, plus the "other records with this name" payload.

## Requirements
- Returns the person (names FR/AR, birth info when present) and all linked attempts, newest year first, each with year, exam number, serie, moyenne, decision (normalized value; raw available), optional school/wilaya.
- Includes a see-also list derived from PENDING link_suggestions involving this person (both directions), carrying enough display data for neutral "other records with this name" links.
- Only attempts from published years are included; a person whose every attempt is unpublished is a 404 publicly.
- Cached with the same invalidation contract as 007.

## Out of scope
- Admin preview of unpublished data (022); suggestion accept/reject (023).

## Done when
- [ ] Tests: multi-attempt person returns both attempts ordered correctly; see-also appears for the seeded pending suggestion and is absent otherwise; unpublished-only person → 404; unknown id → 404; cache behavior verified.
