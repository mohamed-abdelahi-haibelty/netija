# 018 — Mapping Preview (API + Admin UI)

**Depends on:** 014, 016
**Context:** project-overview.md (admin flow step 3), testing.md (preview scenarios), error-handling.md (MISSING_REQUIRED_COLUMNS).

## Goal
The human-in-the-loop step: before any import, the admin sees what was detected and fixes what wasn't.

## Requirements
- Preview endpoint for an uploaded import: returns detected headers, the proposed canonical mapping, a few sample values per column, unrecognized headers, and floor violations — reading only headers plus a small sample, never parsing the full file. The mapping logic is the single source of truth shared with the worker (same aliases — including learned ones), not a reimplementation.
- Admin preview UI: the columns with their samples, the proposed target per column, a way to remap any column to a canonical field (or ignore it), clear flagging of unrecognized columns and floor violations, and a confirm action that is blocked while the floor is violated. The admin also sets the exam year and the date-format configuration here.
- The confirmed payload (mapping + year + date format) is what task 019's confirm endpoint will accept.

## Out of scope
- Enqueueing/processing (019); visual design.

## Done when
- [ ] API tests: every fixture previews with correct auto-mapping; unknown headers flagged; floor violation reported; full-file parsing demonstrably avoided.
- [ ] UI tests: remapping updates the confirm payload; confirm blocked on floor violation; localized and axe-clean.
