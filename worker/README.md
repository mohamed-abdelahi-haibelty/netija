# worker

Python 3.12 data pipeline. Handles Excel reading, cleaning, column mapping, and loading into PostgreSQL.

This is an independent Python package — not part of the npm workspaces. See `context/tracker/architecture.md` for the full worker design.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

## CLI

```bash
DATABASE_URL=postgresql://... python worker.py --file-id <importId> --exam-year <year> --mapping '<json column mapping>'
```

`--file-id` is the numeric `imports` row id (not a filesystem path) — the
loader resolves the uploaded file's path itself from that row. Runs the
full read -> map -> clean -> load pipeline against Postgres (`loader.py`)
in a single transaction and always prints exactly one JSON object to
stdout, setting the exit code accordingly:

- Success: `{"ok": true, "inserted": 12, "rejected": 3, "duplicates_skipped": 0}`, exit `0`.
- Failure: `{"ok": false, "code": "VALIDATION_ERROR" | "IMPORT_NOT_FOUND" | "MISSING_REQUIRED_COLUMNS" | "UNREADABLE_FILE" | "INTERNAL", "reason": "..."}`, exit `1`.

## Tests

Loader/worker tests run against a real, disposable Postgres (docker compose,
see the repo root) with `DATABASE_URL` set — either export it or let the
repo-root `.env` supply it (loaded automatically via `python-dotenv` in
`tests/conftest.py`):

```bash
pytest
```

## Lint / format

```bash
ruff check .
black .
```

## Fixtures

`tests/fixtures/` holds one small `.xlsx` per historical export format — see `tests/fixtures/README.md` for what each one covers and why. These files are protected (see `context/tracker/ai-workflow-rules.md`); add a new fixture rather than editing an existing one.
