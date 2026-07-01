# 015 — Python Worker Skeleton & Fixtures

**Depends on:** 001
**Context:** testing.md (tooling, fixtures — this task creates them), code-standards.md (Python rules), architecture.md (worker boundary).

## Goal
The Python package with tooling, its CLI contract, and the complete fixture library encoding every historical file format.

## Requirements
- Python package under `worker/` with dependency manifest, lint/format tooling, pytest configured, and a Dockerfile.
- CLI entry accepting the agreed arguments (file id, exam year, mapping JSON, plus date-format configuration) and emitting a single JSON result object on stdout per error-handling.md worker rules — initially a stub that validates arguments.
- Fixtures: one small file per historical format (2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2015) with faithful headers and 5–10 fully fabricated rows each, deliberately including the known nasties (leading-zero exam numbers, decision variants like Ajourné(e)/Sessionaire/Abscent/Examen annulé, placeholder 31/12 birth dates, month-first vs day-first vs month-name dates, Arabic name columns where the format has them, missing NNI in 2022) — plus the synthetic future-minimal fixture (exam number + one name only).
- A fixtures README mapping each file to its source-year format and its traps.

## Out of scope
- Any real mapping/cleaning/loading logic (016–020). No real personal data in fixtures.

## Done when
- [ ] pytest runs green; a smoke test opens every fixture with pandas (dtype=str) and asserts its exact expected header list.
- [ ] The CLI stub returns the structured JSON contract for both valid and invalid invocations.
