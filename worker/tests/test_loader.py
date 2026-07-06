"""Tests for worker/loader.py against a real, disposable Postgres —
testing.md: "Loader (against disposable Postgres): inserting the same file
twice yields identical counts (idempotency); a mid-load failure rolls back
fully (no partial year)."
"""

from __future__ import annotations

from unittest.mock import patch

import psycopg
import pytest

import loader
from cleaning import CleanRow, RejectedRow

EXAM_YEAR = 2024


def _row(exam_no: str) -> CleanRow:
    return CleanRow(
        exam_year=EXAM_YEAR,
        exam_no=exam_no,
        name_fr="Test Person",
        name_ar=None,
        serie="SN",
        decision="Admis",
        decision_raw="Admis",
        moyenne=12.5,
    )


# ---------------------------------------------------------------------------
# check_mapping_floor
# ---------------------------------------------------------------------------


def test_floor_passes_with_exam_no_and_a_french_name() -> None:
    assert loader.check_mapping_floor({"NODOSS": "exam_no", "NOMPL": "name_fr"}) == []


def test_floor_passes_with_exam_no_and_only_an_arabic_name() -> None:
    assert loader.check_mapping_floor({"NODOSS": "exam_no", "NOMPA": "name_ar"}) == []


def test_floor_flags_missing_exam_no() -> None:
    assert loader.check_mapping_floor({"NOMPL": "name_fr"}) == ["exam_no"]


def test_floor_flags_missing_name() -> None:
    assert loader.check_mapping_floor({"NODOSS": "exam_no"}) == ["name"]


def test_floor_flags_both_missing() -> None:
    assert loader.check_mapping_floor({"SERIE": "serie"}) == ["exam_no", "name"]


# ---------------------------------------------------------------------------
# load_import
# ---------------------------------------------------------------------------


def test_inserts_clean_rows_with_an_auto_populated_public_slug(dsn, make_import) -> None:
    import_id = make_import("future_minimal.xlsx")
    rows = [_row("00001"), _row("00002")]

    result = loader.load_import(dsn, import_id, EXAM_YEAR, rows, [], {})

    assert result.inserted == 2
    assert result.duplicates_skipped == 0

    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT exam_no, public_slug FROM attempts WHERE import_id = %s ORDER BY exam_no",
            [import_id],
        )
        attempt_rows = cur.fetchall()
    assert [r[0] for r in attempt_rows] == ["00001", "00002"]
    # public_slug is never set by the loader — the DB default must fill it.
    assert all(r[1] for r in attempt_rows)


def test_load_import_reports_progress_via_a_separate_connection(dsn, make_import) -> None:
    """The admin dashboard's progress bar was stuck at 0% for the whole run
    (only worker.py's caller set 0% at start and 100% at the very end) —
    load_import must report interim progress as batches complete, and that
    report has to land on imports.progress THROUGH A SEPARATE CONNECTION
    from the main load transaction (see report_progress's docstring): if it
    shared that transaction, nothing would be visible to another connection
    (the API's status endpoint, or this test) until the whole load commits,
    which is exactly the bug being fixed.
    """
    import_id = make_import("future_minimal.xlsx")
    rows = [_row("00001"), _row("00002")]

    loader.load_import(dsn, import_id, EXAM_YEAR, rows, [], {})

    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute("SELECT progress FROM imports WHERE id = %s", [import_id])
        [(progress,)] = cur.fetchall()
    # All rows loaded in one batch -> the loading phase's terminal value.
    assert progress == loader._LOAD_PROGRESS_END


def test_records_rejects_with_row_number_reason_and_raw_data(dsn, make_import) -> None:
    import_id = make_import("future_minimal.xlsx")
    rejects = [RejectedRow(row_number=3, reason="missing serie", column="serie")]
    raw_rows = {3: {"N° Bac": "00003", "Nom Complet": "Someone"}}

    result = loader.load_import(dsn, import_id, EXAM_YEAR, [], rejects, raw_rows)

    assert result.inserted == 0
    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT row_number, reason, raw_data FROM rejects WHERE import_id = %s",
            [import_id],
        )
        reject_rows = cur.fetchall()
    assert reject_rows == [(3, "missing serie", {"N° Bac": "00003", "Nom Complet": "Someone"})]


def test_a_blank_cell_in_a_rejected_rows_raw_data_does_not_crash_the_load(dsn, make_import) -> None:
    """A genuinely blank Excel cell survives into raw_rows_by_number (built
    from `df.to_dict(orient="records")` in worker.py) as Python float `nan`
    even in a dtype=str column. Postgres's `jsonb` column rejects the literal
    `NaN` token json.dumps would otherwise emit — this reproduces a real
    production file (a 2025 result file with a blank LIEUN_FR cell) that
    failed the whole import with "invalid input syntax for type json".
    """
    import_id = make_import("future_minimal.xlsx")
    rejects = [RejectedRow(row_number=3, reason="missing serie", column="serie")]
    raw_rows = {3: {"N° Bac": "00003", "LIEUN_FR": float("nan")}}

    result = loader.load_import(dsn, import_id, EXAM_YEAR, [], rejects, raw_rows)

    assert result.inserted == 0
    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT raw_data FROM rejects WHERE import_id = %s",
            [import_id],
        )
        [(raw_data,)] = cur.fetchall()
    assert raw_data == {"N° Bac": "00003", "LIEUN_FR": None}


def test_rerunning_the_same_import_is_idempotent_on_attempts(dsn, make_import) -> None:
    import_id = make_import("future_minimal.xlsx")
    rows = [_row("00001"), _row("00002")]

    first = loader.load_import(dsn, import_id, EXAM_YEAR, rows, [], {})
    assert first.inserted == 2
    assert first.duplicates_skipped == 0

    second = loader.load_import(dsn, import_id, EXAM_YEAR, rows, [], {})
    assert second.inserted == 0
    assert second.duplicates_skipped == 2

    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM attempts WHERE import_id = %s", [import_id])
        assert cur.fetchone()[0] == 2


def test_rerun_replaces_rejects_instead_of_duplicating_them(dsn, make_import) -> None:
    import_id = make_import("future_minimal.xlsx")
    rejects = [RejectedRow(row_number=1, reason="missing serie", column="serie")]
    raw_rows = {1: {"N° Bac": "00001"}}

    loader.load_import(dsn, import_id, EXAM_YEAR, [], rejects, raw_rows)
    loader.load_import(dsn, import_id, EXAM_YEAR, [], rejects, raw_rows)

    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM rejects WHERE import_id = %s", [import_id])
        assert cur.fetchone()[0] == 1


def test_a_conflicting_row_from_a_different_import_counts_as_a_duplicate(dsn, make_import) -> None:
    first_import = make_import("future_minimal.xlsx")
    second_import = make_import("future_minimal.xlsx")
    loader.load_import(dsn, first_import, EXAM_YEAR, [_row("00001")], [], {})

    result = loader.load_import(dsn, second_import, EXAM_YEAR, [_row("00001")], [], {})

    assert result.inserted == 0
    assert result.duplicates_skipped == 1


def test_a_mid_load_failure_leaves_the_database_untouched(dsn, make_import) -> None:
    import_id = make_import("future_minimal.xlsx")
    # More than one BATCH_SIZE-sized chunk, so the failure below happens on
    # the SECOND batch, after the first has already (provisionally) inserted
    # rows within the same not-yet-committed transaction.
    rows = [_row(f"{n:05d}") for n in range(1, loader.BATCH_SIZE + 50)]

    real_execute = psycopg.Cursor.execute
    calls = {"attempts_batches": 0}

    def _flaky_execute(self, query, params=None, **kwargs):
        if isinstance(query, str) and "INSERT INTO attempts" in query:
            calls["attempts_batches"] += 1
            if calls["attempts_batches"] == 2:
                raise RuntimeError("simulated mid-load failure")
        return real_execute(self, query, params, **kwargs)

    with patch.object(psycopg.Cursor, "execute", _flaky_execute):
        with pytest.raises(RuntimeError, match="simulated mid-load failure"):
            loader.load_import(dsn, import_id, EXAM_YEAR, rows, [], {})

    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM attempts WHERE import_id = %s", [import_id])
        assert cur.fetchone()[0] == 0


def test_load_import_atomically_marks_the_import_completed_with_summary_counts(
    dsn, make_import
) -> None:
    """The status/summary write moved INTO this transaction (task 032's
    loader-atomicity fix) so that data and terminal status can never
    disagree — a crash between "rows committed" and "status flipped" is no
    longer possible because there is no longer a gap between them.
    """
    import_id = make_import("future_minimal.xlsx")
    rows = [_row("00001"), _row("00002")]
    rejects = [RejectedRow(row_number=3, reason="missing serie", column="serie")]
    raw_rows = {3: {"N° Bac": "00003"}}

    result = loader.load_import(dsn, import_id, EXAM_YEAR, rows, rejects, raw_rows)

    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT status, summary_inserted, summary_rejected, "
            "summary_duplicates_skipped, failure_reason FROM imports WHERE id = %s",
            [import_id],
        )
        row = cur.fetchone()
    assert row == ("completed", result.inserted, len(rejects), result.duplicates_skipped, None)


def test_cancellation_mid_batch_rolls_back_everything_already_inserted(dsn, make_import) -> None:
    """A 'cancelling' status observed partway through a multi-batch load
    must stop the load and roll back EVERYTHING written so far in this
    not-yet-committed transaction, including earlier batches — not just
    skip the remaining ones.
    """
    import_id = make_import("future_minimal.xlsx")
    rows = [_row(f"{n:05d}") for n in range(1, loader.BATCH_SIZE + 50)]  # 2 batches

    calls = {"n": 0}

    def _fake_cancel_requested(_dsn: str, _import_id: int) -> bool:
        calls["n"] += 1
        # Pass the initial check and the first attempts batch, then report
        # cancellation starting with the second batch.
        return calls["n"] > 2

    with patch.object(loader, "_cancel_requested", side_effect=_fake_cancel_requested):
        with pytest.raises(loader.ImportCancelled):
            loader.load_import(dsn, import_id, EXAM_YEAR, rows, [], {})

    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM attempts WHERE import_id = %s", [import_id])
        assert cur.fetchone()[0] == 0
        cur.execute("SELECT status FROM imports WHERE id = %s", [import_id])
        assert cur.fetchone()[0] == "pending"


def test_resolve_file_path_returns_none_for_an_unknown_import(dsn) -> None:
    assert loader.resolve_file_path(dsn, 999_999) is None


def test_resolve_file_path_returns_the_stored_path(dsn, make_import) -> None:
    import_id = make_import("future_minimal.xlsx")
    path = loader.resolve_file_path(dsn, import_id)
    assert path is not None
    assert path.endswith("future_minimal.xlsx")
