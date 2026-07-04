"""Shared fixtures for tests that touch a real, disposable Postgres —
testing.md's "Loader tests against a disposable Postgres". A local Postgres
is expected to already be running (docker compose, task 002) with
DATABASE_URL pointing at it, exactly like the api/'s schema integration
tests.
"""

from __future__ import annotations

import os
from pathlib import Path

import psycopg
import pytest
from dotenv import load_dotenv

FIXTURES_DIR = Path(__file__).parent / "fixtures"

# DATABASE_URL lives in the repo-root .env (task 002), not in the worker
# package itself. Local dev runs pytest with worker/ as cwd, so load it
# explicitly; override=False (the default) means an already-exported
# DATABASE_URL (e.g. in CI) always wins.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")


@pytest.fixture
def dsn() -> str:
    value = os.environ.get("DATABASE_URL")
    if not value:
        pytest.skip("DATABASE_URL is not set; this test needs a running Postgres")
    return value


@pytest.fixture(autouse=True)
def _clean_import_tables(dsn: str) -> None:
    """Give every loader/worker test a clean slate. Truncating `imports`
    cascades to `attempts` and `rejects` (both FK-reference it) — same
    TRUNCATE pattern api/src/db/__tests__/schema.test.ts uses. Runs before
    AND after so a failed prior run can't poison the next.
    """

    def _truncate() -> None:
        with psycopg.connect(dsn) as conn, conn.cursor() as cur:
            cur.execute("TRUNCATE rejects, attempts, imports RESTART IDENTITY CASCADE")

    _truncate()
    yield
    _truncate()


@pytest.fixture
def make_import(dsn: str):
    """Insert a disposable `imports` row pointing at a real fixture file and
    return its id. The loader/worker resolve `file_path` from this row
    themselves (architecture.md: the worker owns loading, not the api), so
    every real end-to-end test needs one.
    """

    def _make(fixture_filename: str) -> int:
        file_path = str(FIXTURES_DIR / fixture_filename)
        with psycopg.connect(dsn) as conn, conn.cursor() as cur:
            cur.execute(
                "INSERT INTO imports (original_filename, file_path) VALUES (%s, %s) RETURNING id",
                [fixture_filename, file_path],
            )
            (import_id,) = cur.fetchone()
        return import_id

    return _make
