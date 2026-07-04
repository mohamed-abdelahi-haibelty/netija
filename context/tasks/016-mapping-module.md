# 016 — Column Mapping Module

**Depends on:** 015
**Context:** architecture.md (never-trust-the-file, guaranteed floor), project-overview.md, testing.md.

## Goal

Recognize each year's headers and map them to the minimal canonical fields.

## Requirements

- Canonical fields are ONLY: exam_no, name_fr, name_ar, serie, moyenne, decision. There is NO
  nni, birth_date, or birth_place mapping — if a file has those columns, they
  are simply ignored (reported as recognized-but-unused, never stored).
- Auto-map from real headers to canonical fields across all historical formats.
- Analysis output: proposed mapping, unrecognized headers, and floor violations
  (missing exam_no column, or missing any name column).
- Field availability derived from mapped headers, never from the year.
- Learned aliases (column_aliases) merge with the built-in dictionary.

## Out of scope

- Persistence wiring (020), preview endpoint (018), any birth/nni handling.

## Done when

- [ ] Every historical fixture auto-maps its minimal fields; birth/nni columns
      present in a file are reported as ignored, not stored.
- [ ] future-minimal passes the floor; a file missing exam_no or all names fails
      it with the exact missing field named.
- [ ] An injected learned alias is honored without code changes.
