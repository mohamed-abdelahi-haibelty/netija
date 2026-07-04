# 015 — Python Worker Skeleton & Fixtures

**Depends on:** 001
**Context:** testing.md (tooling, fixtures — this task creates them), code-standards.md (Python rules), architecture.md (worker boundary, minimal model).

## Goal

The Python package with tooling, its CLI contract, and the complete fixture library encoding every historical file format.

## Requirements

- Python package under `worker/` with dependency manifest, lint/format tooling, pytest configured, and a Dockerfile.
- CLI entry accepting the agreed arguments (file id, exam year, mapping JSON) and emitting a single JSON result object on stdout per error-handling.md worker rules — initially a stub that validates arguments.
- Fixtures: one small file per historical format (2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2015) with faithful headers and 5–10 fully fabricated rows each. Faithful headers means the fixtures MUST still include the NNI, birth-date, and birth-place columns where the real files have them — the pipeline's job is to ignore these, so the fixtures must contain them to test that they are dropped and never stored. Deliberately include the known nasties that still matter: leading-zero exam numbers, decision variants (Ajourné(e) / Sessionaire / Abscent / Examen annulé), Arabic name columns where the format has them, and the varying column names/absences across years (e.g. 2022 has no NNI column while 2021 does — used to test that field availability is detected per file, never hardcoded by year). Plus the synthetic future-minimal fixture (exam number + one name only).
- A fixtures README mapping each file to its source-year format, which columns are stored vs ignored, and its traps.

## Out of scope

- Any real mapping/cleaning/loading logic (016–020). No real personal data in fixtures.

## Done when

- [ ] pytest runs green; a smoke test opens every fixture with pandas (dtype=str) and asserts its exact expected header list (including the NNI/birth columns that exist in the file but will be ignored downstream).
- [ ] The CLI stub returns the structured JSON contract for both valid and invalid invocations.
