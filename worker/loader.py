"""Loads cleaned rows into Postgres: batched, transactional, idempotent.

This module owns all direct Postgres access for the import pipeline (the
loader is the one place raw SQL is allowed, per code-standards.md). It never
reads Excel files or does any mapping/cleaning itself — it only takes
already-cleaned rows (worker/cleaning.py's output) and writes them.

Idempotency (architecture.md invariant 5, "re-running any import job
produces no duplicate attempts"): attempts are inserted with
`ON CONFLICT (exam_year, exam_no) DO NOTHING`, so re-running the same file
(or a different file that happens to overlap on exam_year/exam_no) never
creates duplicate rows — the conflicting rows are counted as
`duplicates_skipped` instead. Rejects have no such natural key, so any
rejects left over from a PRIOR run of the SAME import id are deleted before
the fresh set is written, keeping the reject report a true reflection of the
latest run rather than an ever-growing log. Both the delete and every insert
happen inside one transaction (a single `with psycopg.connect(...) as conn`
block, which commits on clean exit and rolls back on any exception) so a
crash partway through leaves neither table changed — no half-loaded year.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass

import psycopg
from psycopg.types.json import Jsonb

from cleaning import CleanRow, RejectedRow
from mapping import missing_required_fields


def _json_safe(value: object) -> object:
    """Postgres's `jsonb` column enforces strict JSON, which has no NaN or
    Infinity token — but a blank Excel cell survives into `raw_row` (see
    worker.py) as Python float `nan` even in a `dtype=str` column (the same
    quirk cleaning.py's `_clean_text` already documents), and `Jsonb`'s
    underlying `json.dumps` happily emits the invalid `NaN`/`Infinity`
    tokens by default. `None` is also the semantically correct
    representation of "the cell was empty" for this raw audit-trail copy.
    """
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


# Row count per batched INSERT. Keeps a 50k-row file well inside the
# <2-minute results-day budget (architecture.md) via a handful of round
# trips instead of one per row, while keeping each statement's parameter
# count (9 columns * batch size) comfortably under Postgres limits.
BATCH_SIZE = 1000


def check_mapping_floor(mapping: dict[str, str]) -> list[str]:
    """Re-check the guaranteed floor directly on the CONFIRMED header->field
    mapping the job was enqueued with. The API already enforces this at
    confirm time (confirm.ts's checkFloor), but the loader is the last line
    of defense before writing to Postgres, and a floor violation here means
    the whole file is unloadable (every row would reject on exam_no or
    name) rather than a normal per-row rejection — so it fails the job with
    one precise reason instead of silently rejecting every single row.
    Shares its arithmetic with mapping.py's `analyze_headers` via
    `missing_required_fields` — this call remains a deliberate second check,
    not just a code reuse, per this function's own docstring above.
    """
    return missing_required_fields(set(mapping.values()))


@dataclass(frozen=True)
class LoadResult:
    inserted: int
    duplicates_skipped: int


class ImportCancelled(Exception):
    """Raised mid-load when an admin has requested cancellation (task 032).

    Raised INSIDE load_import's transaction, so the surrounding
    `with psycopg.connect(...)` block rolls back everything this run has
    written so far — the exact same "cancel before commit leaves zero rows"
    guarantee a mid-load crash already gets from that block (see the module
    docstring), just triggered deliberately instead of by an accident.
    """


def _chunked(items: list, size: int):
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _cancel_requested(dsn: str, import_id: int) -> bool:
    """Polled once per batch on its OWN connection (same reasoning as
    report_progress below) so a 'cancelling' write from the API is visible
    immediately, instead of only after the main load transaction commits —
    which would defeat cancellation's whole purpose.
    """
    try:
        with psycopg.connect(dsn, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT status FROM imports WHERE id = %s", [import_id])
                row = cur.fetchone()
        return row is not None and row[0] == "cancelling"
    except Exception:  # noqa: BLE001 - a failed check must never itself abort the load
        return False


def report_progress(dsn: str, import_id: int, progress: int) -> None:
    """Best-effort progress ping on its OWN connection, deliberately outside
    the main load's transaction. `load_import` wraps the delete+insert
    sequence in one transaction so a crash partway through leaves nothing
    changed (see the module docstring) — but that means anything written
    through that same connection is invisible to every other connection
    (the API's status endpoint included) until it commits at the very end,
    which would defeat the purpose of interim progress entirely. The
    `imports.progress` column doesn't need the same atomicity guarantee as
    `attempts`/`rejects`, so it gets its own autocommit connection. A
    failure here must never fail the actual load.
    """
    try:
        with psycopg.connect(dsn, autocommit=True) as conn:
            conn.execute("UPDATE imports SET progress = %s WHERE id = %s", [progress, import_id])
    except Exception:  # noqa: BLE001 - progress is cosmetic, never load-critical
        pass


def _insert_attempts(
    cur: psycopg.Cursor,
    exam_type: str,
    exam_year: int,
    import_id: int,
    rows: list[CleanRow],
    report_done: Callable[[int], None],
    raise_if_cancelled: Callable[[], None],
) -> int:
    inserted = 0
    for batch in _chunked(rows, BATCH_SIZE):
        raise_if_cancelled()
        values_sql = ", ".join(["(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"] * len(batch))
        params: list[object] = []
        for row in batch:
            params.extend(
                [
                    exam_type,
                    exam_year,
                    row.exam_no,
                    row.name_fr,
                    row.name_ar,
                    row.serie,
                    row.moyenne,
                    row.decision,
                    row.decision_raw,
                    import_id,
                ]
            )
        # public_slug is deliberately never set here — its DB-side DEFAULT
        # (see schema.ts) self-populates it for every inserter. ON CONFLICT
        # targets (exam_type, exam_year, exam_no): a Bac and a Brevet
        # candidate may share (year, exam_no), so exam_type is part of the key.
        cur.execute(
            f"""
            INSERT INTO attempts
                (exam_type, exam_year, exam_no, name_fr, name_ar, serie, moyenne,
                 decision, decision_raw, import_id)
            VALUES {values_sql}
            ON CONFLICT (exam_type, exam_year, exam_no) DO NOTHING
            RETURNING id
            """,
            params,
        )
        inserted += len(cur.fetchall())
        report_done(len(batch))
    return inserted


def _insert_rejects(
    cur: psycopg.Cursor,
    import_id: int,
    rejects: list[RejectedRow],
    raw_rows_by_number: dict[int, dict[str, object]],
    report_done: Callable[[int], None],
    raise_if_cancelled: Callable[[], None],
) -> None:
    for batch in _chunked(rejects, BATCH_SIZE):
        raise_if_cancelled()
        values_sql = ", ".join(["(%s,%s,%s,%s)"] * len(batch))
        params: list[object] = []
        for reject in batch:
            raw_row = raw_rows_by_number.get(reject.row_number, {})
            safe_row = {k: _json_safe(v) for k, v in raw_row.items()}
            # Jsonb (not plain dict) is how psycopg3 knows to adapt the
            # value for a `jsonb` column instead of sending it as plain text.
            params.extend([import_id, reject.row_number, Jsonb(safe_row), reject.reason])
        cur.execute(
            f"""
            INSERT INTO rejects (import_id, row_number, raw_data, reason)
            VALUES {values_sql}
            """,
            params,
        )
        report_done(len(batch))


# Loading (this module) is the read -> clean -> load pipeline's slowest,
# most batch-friendly phase, so it owns the bulk of the progress range;
# worker.py's read/clean steps report the 0-20 span before this ever runs.
_LOAD_PROGRESS_START = 20
_LOAD_PROGRESS_END = 95


def load_import(
    dsn: str,
    import_id: int,
    exam_type: str,
    exam_year: int,
    rows: list[CleanRow],
    rejects: list[RejectedRow],
    raw_rows_by_number: dict[int, dict[str, object]],
) -> LoadResult:
    """Load one import's cleaned rows and rejects, AND flip its terminal
    status to 'completed', all in one transaction. See the module docstring
    for the idempotency/rollback reasoning.

    Folding the status/summary write in here (rather than leaving it to a
    separate write from the Node caller, as an earlier version of this
    function did) closes a real atomicity gap: the data commit and the
    "this import is done" status used to live on two different connections
    in two different processes, so a crash of the coordinating Node process
    between them could leave rows committed but the import stuck reading
    'processing' forever. With the status write inside this same
    transaction, there is no such in-between state: either everything
    commits together, or none of it does.

    Also polls for a 'cancelling' status once per batch (task 032) and
    raises ImportCancelled if seen — see that class and `_cancel_requested`
    for why this safely produces zero rows for this import.

    Reports coarse progress (imports.progress, 20-95%) as batches complete,
    on a separate autocommit connection from the main load transaction —
    see `report_progress` for why it can't share that transaction.
    """
    total = len(rows) + len(rejects)
    done = 0

    def report_done(n: int) -> None:
        nonlocal done
        done += n
        if total == 0:
            return
        fraction = done / total
        progress = _LOAD_PROGRESS_START + round(
            fraction * (_LOAD_PROGRESS_END - _LOAD_PROGRESS_START)
        )
        report_progress(dsn, import_id, progress)

    def raise_if_cancelled() -> None:
        if _cancel_requested(dsn, import_id):
            raise ImportCancelled("Import was cancelled by an admin.")

    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            raise_if_cancelled()
            cur.execute("DELETE FROM rejects WHERE import_id = %s", [import_id])
            _insert_rejects(
                cur, import_id, rejects, raw_rows_by_number, report_done, raise_if_cancelled
            )
            inserted = _insert_attempts(
                cur, exam_type, exam_year, import_id, rows, report_done, raise_if_cancelled
            )
            raise_if_cancelled()

            duplicates_skipped = len(rows) - inserted
            cur.execute(
                """
                UPDATE imports
                SET status = 'completed',
                    summary_inserted = %s,
                    summary_rejected = %s,
                    summary_duplicates_skipped = %s,
                    failure_reason = NULL,
                    updated_at = now()
                WHERE id = %s
                """,
                [inserted, len(rejects), duplicates_skipped, import_id],
            )

    return LoadResult(inserted=inserted, duplicates_skipped=duplicates_skipped)


def resolve_file_path(dsn: str, import_id: int) -> str | None:
    """Look up the uploaded file's path from the `imports` row, so the
    Node-side caller only has to forward the import id (see
    api/src/services/importJob.ts's comment on this division of ownership).
    Returns None if no import with this id exists.
    """
    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT file_path FROM imports WHERE id = %s", [import_id])
            row = cur.fetchone()
    return row[0] if row else None
