# 017 — Cleaning & Normalization Module

**Depends on:** 016
**Context:** architecture.md (decision enum, date rules, match_key), testing.md (cleaning/identity unit tests).

## Goal
Turn a raw mapped DataFrame into clean, typed, normalized rows ready for loading — deterministically and without silent drops.

## Requirements
- Everything read as text first; conversions are explicit per column.
- Trimming/whitespace normalization on all text fields; exam numbers and NNI keep leading zeros and are validated as digit strings.
- Decision normalization to the fixed enum with the raw value preserved; every variant present in the fixtures maps correctly; unknown variants are flagged (row keeps the raw value with a warning recorded) — never silently passed or dropped.
- Date parsing driven by the per-import format configuration (day-first, month-first, month-name); unparseable or unconfigured-ambiguous dates yield a null plus a recorded reason, never a guess.
- Moyenne coerced to numeric (out of 20); impossible values flagged.
- Name normalization and match_key computation exactly per architecture.md, applied only when name + birth date + birth place are all present; Arabic names pass through normalization consistently.
- Row classification: importable (has year, exam number, ≥1 name) vs rejected-with-reason; counts of both are part of the module's output.

## Out of scope
- Database writes (020), linking (021).

## Done when
- [ ] Unit tests cover every decision variant, all three date styles, leading-zero preservation, match_key presence/absence rules, and the importable-vs-rejected split with reasons.
- [ ] Running the module twice on the same fixture yields identical output (determinism).
