# 014 — Excel Upload API

**Depends on:** 013
**Context:** project-overview.md (upload constraints), error-handling.md (file error codes), testing.md (upload scenarios).

## Goal
The authenticated endpoint that accepts the yearly Excel file and records the import.

## Requirements
- Auth-protected multipart upload accepting exactly one file.
- Constraints enforced with the standard error responses: .xlsx/.xls only, verified by content sniffing (not just extension/mime claim) → 415; max 25 MB → 413; missing file or multiple files → 400.
- Accepted files are stored on the shared uploads volume under a generated identifier; an imports row is created in its initial state; the response returns the import identifier.
- Original files are never deleted by application code.

## Out of scope
- Preview, mapping, processing (015–020).

## Done when
- [ ] Every upload scenario in testing.md passes, including the renamed-executable sniffing case and the unauthenticated 401.
- [ ] A valid upload produces the file on disk and a queryable imports row.
