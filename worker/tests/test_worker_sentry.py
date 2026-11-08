"""Tests for worker.py's Sentry wiring (task 026): a truly unexpected
exception escaping run_import reaches Sentry with {import_id, file_id,
stage} context and no row content; run_import's own precise, expected
failure codes (and CLI validation errors) never do; nothing initializes
without SENTRY_DSN (error-handling.md's Sentry Configuration + Worker
Rules). DB-free: run_import is monkeypatched rather than exercised for
real, so these don't need a running Postgres.
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest

import worker


def test_sentry_never_initializes_without_dsn(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    mock_init = MagicMock()
    monkeypatch.setattr(worker.sentry_sdk, "init", mock_init)

    worker.init_sentry()

    mock_init.assert_not_called()


def test_sentry_initializes_with_a_low_trace_sample_rate_and_no_local_vars(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SENTRY_DSN", "https://example@o0.ingest.sentry.io/1")
    monkeypatch.setenv("APP_ENV", "staging")
    mock_init = MagicMock()
    monkeypatch.setattr(worker.sentry_sdk, "init", mock_init)

    worker.init_sentry()

    mock_init.assert_called_once()
    kwargs = mock_init.call_args.kwargs
    assert kwargs["dsn"] == "https://example@o0.ingest.sentry.io/1"
    assert kwargs["environment"] == "staging"
    assert kwargs["traces_sample_rate"] == 0.1
    # The primary PII defense: a stack frame at the point of an unexpected
    # exception could otherwise dump the whole in-memory dataframe (real
    # names) as a local variable.
    assert kwargs["include_local_variables"] is False


def test_scrub_pii_strips_request_data_defensively() -> None:
    event = {"request": {"data": {"no": "00573"}}, "message": "boom"}

    scrubbed = worker._scrub_pii(event, {})

    assert "request" not in scrubbed
    assert scrubbed["message"] == "boom"


def test_unexpected_run_import_exception_is_captured_with_import_file_stage_context(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://unused")
    monkeypatch.setattr(worker, "init_sentry", lambda: None)  # keep this test network-free

    boom = RuntimeError("unexpected bug")
    monkeypatch.setattr(
        worker,
        "run_import",
        lambda dsn, import_id, exam_type, exam_year, mapping: (_ for _ in ()).throw(boom),
    )
    mock_capture = MagicMock()
    mock_set_context = MagicMock()
    monkeypatch.setattr(worker.sentry_sdk, "capture_exception", mock_capture)
    monkeypatch.setattr(worker.sentry_sdk, "set_context", mock_set_context)

    exit_code = worker.main(
        [
            "--file-id",
            "42",
            "--exam-type",
            "bac",
            "--exam-year",
            "2024",
            "--mapping",
            json.dumps({"A": "exam_no", "B": "name_fr"}),
        ]
    )
    out = json.loads(capsys.readouterr().out)

    assert exit_code == 1
    assert out["code"] == "INTERNAL"
    mock_set_context.assert_called_once_with(
        "import", {"import_id": 42, "file_id": "42", "stage": "run_import"}
    )
    mock_capture.assert_called_once_with(boom)


def test_cli_validation_error_never_reaches_sentry(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    mock_capture = MagicMock()
    monkeypatch.setattr(worker.sentry_sdk, "capture_exception", mock_capture)

    exit_code = worker.main(
        ["--exam-type", "bac", "--exam-year", "2024", "--mapping", "{}"]
    )  # missing --file-id
    out = json.loads(capsys.readouterr().out)

    assert exit_code == 1
    assert out["code"] == "VALIDATION_ERROR"
    mock_capture.assert_not_called()


def test_expected_import_outcome_failure_never_reaches_sentry(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://unused")
    monkeypatch.setattr(worker, "init_sentry", lambda: None)
    monkeypatch.setattr(
        worker,
        "run_import",
        lambda dsn, import_id, exam_type, exam_year, mapping: worker.ImportOutcome(
            False, code="IMPORT_NOT_FOUND", reason="no such import"
        ),
    )
    mock_capture = MagicMock()
    monkeypatch.setattr(worker.sentry_sdk, "capture_exception", mock_capture)

    exit_code = worker.main(
        [
            "--file-id",
            "999999",
            "--exam-type",
            "bac",
            "--exam-year",
            "2024",
            "--mapping",
            json.dumps({"A": "exam_no", "B": "name_fr"}),
        ]
    )
    out = json.loads(capsys.readouterr().out)

    assert exit_code == 1
    assert out["code"] == "IMPORT_NOT_FOUND"
    mock_capture.assert_not_called()
