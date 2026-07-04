# 017 — Cleaning & Normalization Module

**Depends on:** 016
**Context:** architecture.md (decision enum), testing.md.

## Goal
Turn a raw mapped DataFrame into clean, typed, minimal rows ready to load.

## Requirements
- Read everything as text first; convert deliberately.
- Trim/normalize text fields; exam_no keeps leading zeros and is validated as a
  digit string (sane length bound, not hardcoded to 5).
- Decision normalization to the fixed enum with decision_raw preserved; every
  observed variant maps; unknown variants flagged, never silently passed.
- Moyenne coerced to numeric (out of 20); impossible values flagged.
- NO match_key computation. NO birth_date / birth_place parsing (those fields
  are not stored). If present in the file, they are dropped, not processed.
- Row classification: importable (has exam_year, exam_no, >=1 name, serie,
  decision) vs rejected-with-reason; counts of both in the output.

## Out of scope
- Database writes (020), any identity/linking (removed from the project).

## Done when
- [ ] Unit tests cover every decision variant, leading-zero preservation, the
      importable-vs-rejected split with reasons, and that birth/nni data is
      dropped if present.
- [ ] Running twice on the same fixture yields identical output (determinism).
