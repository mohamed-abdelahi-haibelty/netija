"""Tests for worker.py: argument validation (DB-free) plus the real
read -> map -> clean -> load pipeline against a disposable Postgres
(testing.md: "every fixture loads with expected counts; loading twice
yields zero new rows and says so").
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import psycopg
import pytest

import worker
from cleaning import clean_dataframe
from mapping import analyze_headers

FIXTURES_DIR = Path(__file__).parent / "fixtures"
EXAM_YEAR = 2024

HISTORICAL_FIXTURES = ["2024", "2023", "2022", "2021", "2020", "2019", "2018", "2017", "2015"]

# ---------------------------------------------------------------------------
# Argument validation (no DB access — these fail before any lookup runs).
# ---------------------------------------------------------------------------


def test_missing_file_id_is_reported_as_validation_error(
    capsys: pytest.CaptureFixture[str],
) -> None:
    exit_code = worker.main(["--exam-year", "2024", "--mapping", "{}"])
    out = json.loads(capsys.readouterr().out)

    assert exit_code == 1
    assert out["ok"] is False
    assert out["code"] == "VALIDATION_ERROR"
    assert "file-id" in out["reason"]


def test_blank_file_id_is_rejected(capsys: pytest.CaptureFixture[str]) -> None:
    exit_code = worker.main(["--file-id", "   ", "--exam-year", "2024", "--mapping", "{}"])
    out = json.loads(capsys.readouterr().out)

    assert exit_code == 1
    assert out["code"] == "VALIDATION_ERROR"


def test_non_numeric_file_id_is_rejected(capsys: pytest.CaptureFixture[str]) -> None:
    exit_code = worker.main(["--file-id", "abc123", "--exam-year", "2024", "--mapping", "{}"])
    out = json.loads(capsys.readouterr().out)

    assert exit_code == 1
    assert out["code"] == "VALIDATION_ERROR"
    assert "file-id" in out["reason"]


@pytest.mark.parametrize("file_id", ["0", "-5"])
def test_non_positive_file_id_is_rejected(file_id: str, capsys: pytest.CaptureFixture[str]) -> None:
    exit_code = worker.main(["--file-id", file_id, "--exam-year", "2024", "--mapping", "{}"])
    out = json.loads(capsys.readouterr().out)

    assert exit_code == 1
    assert out["code"] == "VALIDATION_ERROR"


def test_missing_exam_year_is_reported_as_validation_error(
    capsys: pytest.CaptureFixture[str],
) -> None:
    exit_code = worker.main(["--file-id", "123", "--mapping", "{}"])
    out = json.loads(capsys.readouterr().out)

    assert exit_code == 1
    assert out["code"] == "VALIDATION_ERROR"
    assert "exam-year" in out["reason"]


def test_non_numeric_exam_year_is_rejected(capsys: pytest.CaptureFixture[str]) -> None:
    exit_code = worker.main(["--file-id", "123", "--exam-year", "twenty-24", "--mapping", "{}"])
    out = json.loads(capsys.readouterr().out)

    assert exit_code == 1
    assert out["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize("year", ["1899", "2101", "0", "-5"])
def test_out_of_range_exam_year_is_rejected(year: str, capsys: pytest.CaptureFixture[str]) -> None:
    exit_code = worker.main(["--file-id", "123", "--exam-year", year, "--mapping", "{}"])
    out = json.loads(capsys.readouterr().out)

    assert exit_code == 1
    assert out["code"] == "VALIDATION_ERROR"


def test_missing_mapping_is_reported_as_validation_error(
    capsys: pytest.CaptureFixture[str],
) -> None:
    exit_code = worker.main(["--file-id", "123", "--exam-year", "2024"])
    out = json.loads(capsys.readouterr().out)

    assert exit_code == 1
    assert out["code"] == "VALIDATION_ERROR"
    assert "mapping" in out["reason"]


def test_malformed_mapping_json_is_rejected(capsys: pytest.CaptureFixture[str]) -> None:
    exit_code = worker.main(["--file-id", "123", "--exam-year", "2024", "--mapping", "{not json"])
    out = json.loads(capsys.readouterr().out)

    assert exit_code == 1
    assert out["code"] == "VALIDATION_ERROR"


def test_mapping_must_be_a_json_object_not_an_array(
    capsys: pytest.CaptureFixture[str],
) -> None:
    exit_code = worker.main(["--file-id", "123", "--exam-year", "2024", "--mapping", "[1, 2, 3]"])
    out = json.loads(capsys.readouterr().out)

    assert exit_code == 1
    assert out["code"] == "VALIDATION_ERROR"


def test_output_is_exactly_one_json_line(capsys: pytest.CaptureFixture[str]) -> None:
    worker.main(["--file-id", "123", "--exam-year", "2024", "--mapping", "{not json"])
    captured = capsys.readouterr().out.strip().splitlines()

    assert len(captured) == 1
    json.loads(captured[0])  # does not raise


# ---------------------------------------------------------------------------
# File-level failures (real Postgres lookups, no fixture file needed).
# ---------------------------------------------------------------------------


def test_unknown_import_id_fails_the_job(dsn: str, capsys: pytest.CaptureFixture[str]) -> None:
    exit_code = worker.main(
        [
            "--file-id",
            "999999",
            "--exam-year",
            str(EXAM_YEAR),
            "--mapping",
            json.dumps({"A": "exam_no", "B": "name_fr"}),
        ]
    )
    out = json.loads(capsys.readouterr().out)

    assert exit_code == 1
    assert out["code"] == "IMPORT_NOT_FOUND"


def test_mapping_missing_the_floor_fails_the_job(
    dsn: str, make_import, capsys: pytest.CaptureFixture[str]
) -> None:
    import_id = make_import("2024.xlsx")
    exit_code = worker.main(
        [
            "--file-id",
            str(import_id),
            "--exam-year",
            str(EXAM_YEAR),
            "--mapping",
            json.dumps({"SERIE": "serie"}),
        ]
    )
    out = json.loads(capsys.readouterr().out)

    assert exit_code == 1
    assert out["code"] == "MISSING_REQUIRED_COLUMNS"
    assert "exam_no" in out["reason"]
    assert "name" in out["reason"]

    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM attempts WHERE import_id = %s", [import_id])
        assert cur.fetchone()[0] == 0


def test_unreadable_file_fails_the_job(
    dsn: str, make_import, capsys: pytest.CaptureFixture[str]
) -> None:
    import_id = make_import("does-not-exist.xlsx")
    exit_code = worker.main(
        [
            "--file-id",
            str(import_id),
            "--exam-year",
            str(EXAM_YEAR),
            "--mapping",
            json.dumps({"A": "exam_no", "B": "name_fr"}),
        ]
    )
    out = json.loads(capsys.readouterr().out)

    assert exit_code == 1
    assert out["code"] == "UNREADABLE_FILE"


def test_a_rejected_rows_raw_data_never_stores_a_pii_banned_column(
    dsn: str, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """None of the frozen fixtures under tests/fixtures/ happen to combine a
    PII-category column with an actually-rejected row, so this uses a small
    synthetic file (matching test_preview.py's precedent for cases the
    protected fixtures don't cover) rather than editing a frozen fixture.
    Reproduces architecture.md's "never stores NNI, birth date, or birth
    place at all" invariant being violated for the reject audit trail.
    """
    file_path = tmp_path / "synthetic.xlsx"
    pd.DataFrame(
        [{"NODOSS": "00001", "Nom": "Someone", "LIEUN": "Nouakchott", "SERIE": "SN"}]
    ).to_excel(file_path, index=False)

    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO imports (original_filename, file_path) VALUES (%s, %s) RETURNING id",
            ["synthetic.xlsx", str(file_path)],
        )
        (import_id,) = cur.fetchone()

    # No "decision" mapped at all -> every row is rejected for missing it,
    # which is what puts LIEUN's value into raw_data in the first place.
    exit_code = worker.main(
        [
            "--file-id",
            str(import_id),
            "--exam-year",
            str(EXAM_YEAR),
            "--mapping",
            json.dumps({"NODOSS": "exam_no", "Nom": "name_fr", "SERIE": "serie"}),
        ]
    )
    out = json.loads(capsys.readouterr().out)
    assert exit_code == 0
    assert out["rejected"] == 1

    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute("SELECT raw_data FROM rejects WHERE import_id = %s", [import_id])
        [(raw_data,)] = cur.fetchall()

    assert "LIEUN" not in raw_data
    assert raw_data == {"NODOSS": "00001", "Nom": "Someone", "SERIE": "SN"}


# ---------------------------------------------------------------------------
# Real end-to-end pipeline: every historical fixture + future_minimal.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("name", [*HISTORICAL_FIXTURES, "future_minimal"])
def test_every_fixture_loads_with_self_consistent_counts(
    name: str, dsn: str, make_import, capsys: pytest.CaptureFixture[str]
) -> None:
    fixture_filename = f"{name}.xlsx"
    df = pd.read_excel(FIXTURES_DIR / fixture_filename, dtype=str)
    mapping = analyze_headers(list(df.columns)).mapping
    # The independent oracle: clean_dataframe is already exhaustively tested
    # on its own (test_cleaning.py) — here it just tells us how many rows
    # THIS fixture should produce, so the loader's counts can be checked
    # against reality instead of a hand-maintained magic number per file.
    expected = clean_dataframe(df, mapping, EXAM_YEAR)

    import_id = make_import(fixture_filename)
    exit_code = worker.main(
        [
            "--file-id",
            str(import_id),
            "--exam-year",
            str(EXAM_YEAR),
            "--mapping",
            json.dumps(mapping),
        ]
    )
    out = json.loads(capsys.readouterr().out)

    assert exit_code == 0
    assert out == {
        "ok": True,
        "inserted": len(expected.rows),
        "rejected": len(expected.rejects),
        "duplicates_skipped": 0,
    }
    assert out["inserted"] + out["rejected"] == len(df)

    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM attempts WHERE import_id = %s", [import_id])
        assert cur.fetchone()[0] == len(expected.rows)
        cur.execute("SELECT count(*) FROM rejects WHERE import_id = %s", [import_id])
        assert cur.fetchone()[0] == len(expected.rejects)


def test_running_the_same_import_twice_yields_zero_new_rows_and_says_so(
    dsn: str, make_import, capsys: pytest.CaptureFixture[str]
) -> None:
    fixture_filename = "2024.xlsx"
    df = pd.read_excel(FIXTURES_DIR / fixture_filename, dtype=str)
    mapping = analyze_headers(list(df.columns)).mapping
    import_id = make_import(fixture_filename)
    argv = [
        "--file-id",
        str(import_id),
        "--exam-year",
        str(EXAM_YEAR),
        "--mapping",
        json.dumps(mapping),
    ]

    worker.main(argv)
    first = json.loads(capsys.readouterr().out)

    worker.main(argv)
    second = json.loads(capsys.readouterr().out)

    assert first["inserted"] > 0
    assert second["inserted"] == 0
    assert second["duplicates_skipped"] == first["inserted"]
    assert second["rejected"] == first["rejected"]
