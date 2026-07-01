# 016 — Column Mapping Module

**Depends on:** 015
**Context:** architecture.md (never-trust-the-file, guaranteed floor), project-overview.md (mapping flow), testing.md.

## Goal
The logic that recognizes each year's column headers and detects what's missing or unknown.

## Requirements
- A canonical-field definition and an alias dictionary covering every header across all fixtures (FR and AR header variants included).
- Auto-mapping from actual headers to canonical fields; analysis output listing: the proposed mapping, unrecognized headers, and guaranteed-floor violations (no exam-number column, or no name column in either language).
- Field availability is derived purely from the mapped headers — nothing keyed off the year.
- Aliases are extensible at runtime: learned aliases (persisted by the pipeline in column_aliases) merge with the built-in dictionary; the merge contract is defined here.

## Out of scope
- Persistence wiring (020), preview endpoint (018).

## Done when
- [ ] Every historical fixture auto-maps all of its known headers; each deliberately-unknown header is reported unrecognized.
- [ ] future-minimal passes the floor; fixtures stripped of their exam-number or all name columns fail it with the precise missing fields named.
- [ ] An injected learned alias is honored without code changes.
