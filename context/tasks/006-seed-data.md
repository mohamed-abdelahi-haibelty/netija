# 006 — Development Seed Data

**Depends on:** 003
**Context:** architecture.md (data model), testing.md (fixtures philosophy — fabricated people only).

## Goal
Realistic fake data in the database so the entire public read path (tasks 007–012) can be built and demonstrated before the import pipeline exists.

## Requirements
- A seed script producing: several hundred attempts across at least three exam years; persons and person_links consistent with the linking model; at least one person with attempts in two years (the redemption case: Ajourné then Admis); identical-name persons differing by birth place; Arabic-only, French-only, and bilingual names; all normalized decision values represented; varied SERIE values; one pending link_suggestion pair.
- One imports row per seeded year, marked published (and one unpublished year for later publish-flow work).
- All people are fabricated — no rows copied from real files.
- Idempotent: running twice produces no duplicates.
- Dev only; refuses to run against a production-flagged environment.

## Out of scope
- Real file import logic.

## Done when
- [ ] Two consecutive runs yield identical row counts.
- [ ] The documented scenarios above are queryable (verified by a small test or assertion script).
