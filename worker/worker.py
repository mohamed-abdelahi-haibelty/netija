"""CLI entry point for the Bac results import pipeline.

Invoked by the Node-side queue worker (task 019) as a subprocess. Always
prints exactly one JSON object to stdout and sets the exit code accordingly,
per error-handling.md's worker contract, so the caller can parse a precise
result instead of scraping logs.

Owns the full read -> map -> clean -> load pipeline for one confirmed
import. `--file-id` is actually the import's numeric id (see
api/src/services/importJob.ts's comment on this naming) — the loader
resolves the uploaded file's path itself from the `imports` row, and writes
directly to Postgres (worker/loader.py), never through the API.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from typing import NamedTuple

import pandas as pd

import loader
import mapping as header_mapping
from cleaning import clean_dataframe

MIN_EXAM_YEAR = 1900
MAX_EXAM_YEAR = 2100


class ValidationResult(NamedTuple):
    ok: bool
    code: str | None
    reason: str | None


@dataclass(frozen=True)
class ImportOutcome:
    ok: bool
    code: str | None = None
    reason: str | None = None
    inserted: int = 0
    rejected: int = 0
    duplicates_skipped: int = 0


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Netija Bac results import worker")
    # Not marked required=True: a missing flag must still produce the
    # standard {ok, code, reason} JSON contract, not argparse's own
    # usage-and-exit-2 behavior.
    parser.add_argument("--file-id")
    parser.add_argument("--exam-year")
    parser.add_argument("--mapping", help="JSON-encoded column mapping")
    return parser.parse_args(argv)


def validate(args: argparse.Namespace) -> ValidationResult:
    if not args.file_id or not args.file_id.strip():
        return ValidationResult(False, "VALIDATION_ERROR", "--file-id is required")

    try:
        import_id = int(args.file_id)
    except ValueError:
        return ValidationResult(
            False,
            "VALIDATION_ERROR",
            f"--file-id must be an integer import id, got {args.file_id!r}",
        )
    if import_id <= 0:
        return ValidationResult(
            False, "VALIDATION_ERROR", f"--file-id must be positive, got {import_id}"
        )

    if not args.exam_year:
        return ValidationResult(False, "VALIDATION_ERROR", "--exam-year is required")

    try:
        exam_year = int(args.exam_year)
    except ValueError:
        return ValidationResult(
            False,
            "VALIDATION_ERROR",
            f"--exam-year must be an integer, got {args.exam_year!r}",
        )

    if not (MIN_EXAM_YEAR <= exam_year <= MAX_EXAM_YEAR):
        return ValidationResult(
            False,
            "VALIDATION_ERROR",
            f"--exam-year {exam_year} is outside the accepted range "
            f"({MIN_EXAM_YEAR}-{MAX_EXAM_YEAR})",
        )

    if not args.mapping:
        return ValidationResult(False, "VALIDATION_ERROR", "--mapping is required")

    try:
        mapping = json.loads(args.mapping)
    except json.JSONDecodeError as exc:
        return ValidationResult(False, "VALIDATION_ERROR", f"--mapping is not valid JSON: {exc}")

    if not isinstance(mapping, dict):
        return ValidationResult(False, "VALIDATION_ERROR", "--mapping must be a JSON object")

    return ValidationResult(True, None, None)


def run_import(dsn: str, import_id: int, exam_year: int, mapping: dict[str, str]) -> ImportOutcome:
    """Read the confirmed file, clean it, and load it — the whole pipeline
    for one import. Returns a precise failure code/reason for every
    file-level problem (error-handling.md: "unreadable file, missing
    required columns after mapping ... the job fails with a clear reason");
    row-level problems never reach here as failures, only as counted rejects
    inside `cleaning_result`.
    """
    file_path = loader.resolve_file_path(dsn, import_id)
    if file_path is None:
        return ImportOutcome(False, "IMPORT_NOT_FOUND", f"No import found with id {import_id}")

    missing = loader.check_mapping_floor(mapping)
    if missing:
        return ImportOutcome(
            False,
            "MISSING_REQUIRED_COLUMNS",
            f"Mapping is missing required column(s): {', '.join(missing)}",
        )

    try:
        # dtype=str keeps every cell as text, exactly like preview.py, so
        # leading zeros on exam_no survive and cleaning.py sees the same raw
        # values the mapping preview was built from.
        df = pd.read_excel(file_path, dtype=str)
    except (
        Exception
    ) as exc:  # noqa: BLE001 - any read failure becomes a reported reason, never a crash
        return ImportOutcome(False, "UNREADABLE_FILE", str(exc))

    # Coarse progress so the admin dashboard isn't stuck at 0% for the whole
    # run: read/clean get 0-20%, loader.load_import (the slowest, most
    # batch-friendly phase) reports 20-95% itself as batches complete, and
    # the caller (api/src/services/importJob.ts) sets 100% on success.
    loader.report_progress(dsn, import_id, 10)

    # The reject audit trail keeps the raw row for troubleshooting, but must
    # never carry NNI/birth date/birth place/school/wilaya any more than a
    # successfully inserted attempt does (architecture.md: "never written to
    # the database ... at all") — redact those columns before they're kept.
    banned_headers = header_mapping.banned_pii_headers(list(df.columns))
    raw_rows_by_number = {
        row_number: {k: v for k, v in row.items() if k not in banned_headers}
        for row_number, row in enumerate(df.to_dict(orient="records"), start=1)
    }
    cleaning_result = clean_dataframe(df, mapping, exam_year)
    loader.report_progress(dsn, import_id, 20)

    load_result = loader.load_import(
        dsn,
        import_id,
        exam_year,
        cleaning_result.rows,
        cleaning_result.rejects,
        raw_rows_by_number,
    )

    return ImportOutcome(
        True,
        inserted=load_result.inserted,
        rejected=len(cleaning_result.rejects),
        duplicates_skipped=load_result.duplicates_skipped,
    )


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    result = validate(args)

    if not result.ok:
        print(json.dumps({"ok": False, "code": result.code, "reason": result.reason}))
        return 1

    import_id = int(args.file_id)
    exam_year = int(args.exam_year)
    mapping = json.loads(args.mapping)

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print(json.dumps({"ok": False, "code": "INTERNAL", "reason": "DATABASE_URL is not set"}))
        return 1

    try:
        outcome = run_import(dsn, import_id, exam_year, mapping)
    except (
        Exception
    ) as exc:  # noqa: BLE001 - an unexpected failure still emits the standard contract
        print(json.dumps({"ok": False, "code": "INTERNAL", "reason": str(exc)}))
        return 1

    if not outcome.ok:
        print(json.dumps({"ok": False, "code": outcome.code, "reason": outcome.reason}))
        return 1

    print(
        json.dumps(
            {
                "ok": True,
                "inserted": outcome.inserted,
                "rejected": outcome.rejected,
                "duplicates_skipped": outcome.duplicates_skipped,
            }
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
