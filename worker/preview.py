"""CLI entry point for the admin mapping-preview endpoint (task 018).

Invoked by the Node API as a short-lived subprocess (never through BullMQ —
reading a header row and a handful of sample values is well under the ~1s
budget for request handlers, unlike the full import). Always prints exactly
one JSON object to stdout and sets the exit code accordingly, mirroring
worker.py's contract.

Reuses `mapping.analyze_headers` as the single source of truth for column
recognition — this module adds only file reading and sample extraction on
top of it, never a second mapping implementation.
"""

from __future__ import annotations

import argparse
import json
import sys

import pandas as pd

from mapping import analyze_headers

# Only the header row plus this many data rows are ever read from disk, so a
# 50k-row production file is previewed as fast as a 6-row fixture — pandas'
# `nrows` stops the reader after this many data rows instead of streaming the
# whole sheet.
SAMPLE_ROW_COUNT = 5
# Cap on how many non-blank sample values are surfaced per column in the
# response, so a mostly-blank sample window still shows something useful.
SAMPLE_VALUES_PER_COLUMN = 3


def read_headers_and_samples(file_path: str) -> tuple[list[str], dict[str, list[str]]]:
    """Read the header row and a small sample of data rows from every sheet
    in the workbook — a multi-sheet file (e.g. one tab per exam-number
    range) is one logical dataset, so every sheet's headers must be visible
    for mapping, not just the first sheet's (pandas' default).

    `dtype=str` keeps every cell as text (leading zeros on exam numbers
    survive); `nrows` bounds the read to a handful of data rows per sheet
    regardless of the file's real size — this is what "never parsing the
    full file" means in practice for pandas. `sheet_name=None` returns every
    sheet as a dict instead of only the first.
    """
    sheets = pd.read_excel(file_path, dtype=str, sheet_name=None, nrows=SAMPLE_ROW_COUNT)
    headers: list[str] = []
    samples: dict[str, list[str]] = {}
    for sheet_df in sheets.values():
        for header in (str(h) for h in sheet_df.columns):
            if header not in samples:
                headers.append(header)
                samples[header] = []
            # dropna() skips blank cells so samples show real values; stripping
            # avoids leaking pure-whitespace cells as if they were data.
            values = [v.strip() for v in sheet_df[header].dropna().tolist() if v.strip()]
            remaining = SAMPLE_VALUES_PER_COLUMN - len(samples[header])
            samples[header].extend(values[:remaining])
    return headers, samples


def build_preview(file_path: str, learned_aliases: dict[str, str] | None = None) -> dict:
    headers, samples = read_headers_and_samples(file_path)
    analysis = analyze_headers(headers, learned_aliases)

    columns = [
        {
            "header": col.header,
            "canonicalField": col.canonical_field,
            "status": col.status,
            "ignoredCategory": col.ignored_category,
            "samples": samples.get(col.header, []),
        }
        for col in analysis.columns
    ]

    return {
        "ok": True,
        "columns": columns,
        "missingRequired": analysis.missing_required,
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Netija mapping-preview reader")
    parser.add_argument("--file-path", required=True)
    parser.add_argument(
        "--learned-aliases",
        default="{}",
        help="JSON object of raw_header -> canonical_field learned from prior confirms",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])

    try:
        learned_aliases = json.loads(args.learned_aliases)
        if not isinstance(learned_aliases, dict):
            raise ValueError("--learned-aliases must be a JSON object")
    except (json.JSONDecodeError, ValueError) as exc:
        print(json.dumps({"ok": False, "code": "VALIDATION_ERROR", "reason": str(exc)}))
        return 1

    try:
        result = build_preview(args.file_path, learned_aliases)
    except (
        Exception
    ) as exc:  # noqa: BLE001 - any read failure becomes a reported reason, never a crash
        print(json.dumps({"ok": False, "code": "UNREADABLE_FILE", "reason": str(exc)}))
        return 1

    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
