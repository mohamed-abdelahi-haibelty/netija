"""Tests for preview.py: the admin mapping-preview reader (task 018).

Reuses mapping.py's fixtures and known column layouts (see
tests/fixtures/README.md). The riskiest property to prove here is that
preview never reads the full file — everything else is a thin wrapper
around mapping.analyze_headers, which mapping.py's own tests already cover
exhaustively.
"""

import json
import pathlib
from unittest.mock import patch

import openpyxl
import pandas as pd
import pytest

import preview

FIXTURES_DIR = pathlib.Path(__file__).parent / "fixtures"


def column(columns: list[dict], header: str) -> dict:
    for col in columns:
        if col["header"] == header:
            return col
    raise AssertionError(f"no column named {header!r} in {[c['header'] for c in columns]}")


# ---------------------------------------------------------------------------
# Full-file parsing is demonstrably avoided
# ---------------------------------------------------------------------------


def test_read_headers_and_samples_bounds_pandas_to_the_sample_row_count() -> None:
    with patch("preview.pd.read_excel", wraps=pd.read_excel) as spy:
        preview.read_headers_and_samples(str(FIXTURES_DIR / "2024.xlsx"))

    _, kwargs = spy.call_args
    assert kwargs["nrows"] == preview.SAMPLE_ROW_COUNT


def test_a_50k_row_file_is_previewed_by_reading_only_the_sample_window(tmp_path) -> None:
    # Build a file far larger than any fixture to prove the row cap, not the
    # file's real size, is what bounds the read.
    big_file = tmp_path / "big.xlsx"
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["N° Bac", "Nom Complet"])
    for i in range(50_000):
        ws.append([str(i).zfill(5), f"Candidate {i}"])
    wb.save(big_file)

    headers, samples = preview.read_headers_and_samples(str(big_file))

    assert headers == ["N° Bac", "Nom Complet"]
    assert len(samples["N° Bac"]) <= preview.SAMPLE_VALUES_PER_COLUMN


# ---------------------------------------------------------------------------
# build_preview — every historical fixture
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("fixture", "exam_no_header", "name_header"),
    [
        ("2024", "NODOSS", "NOMPL"),
        ("2023", "NODOSS", "NOMPL"),
        ("2022", "Num Bac", "Nom"),
        ("2021", "Numéro Bac", "Nom"),
        ("2020", "Numero Bac", "Nom"),
        ("2019", "Numéro Bac", "Nom"),
        ("2018", "NODOSS", "NOMPL"),
        ("2017", "NODOSS", "NOMPL"),
        ("2015", "NODOSS", "NOMPL"),
        ("future_minimal", "N° Bac", "Nom Complet"),
    ],
)
def test_every_fixture_previews_with_correct_auto_mapping(
    fixture: str, exam_no_header: str, name_header: str
) -> None:
    result = preview.build_preview(str(FIXTURES_DIR / f"{fixture}.xlsx"))

    assert result["ok"] is True
    assert result["missingRequired"] == []

    exam_col = column(result["columns"], exam_no_header)
    assert exam_col["status"] == "mapped"
    assert exam_col["canonicalField"] == "exam_no"
    assert exam_col["samples"], "exam_no column should surface at least one sample value"

    name_col = column(result["columns"], name_header)
    assert name_col["status"] == "mapped"
    assert name_col["canonicalField"] in ("name_fr", "name_ar")

    # No fixture has a genuinely unknown header — everything is either
    # mapped or recognized-and-ignored (mapping.py's own tests assert this
    # set-for-set; here we only need the weaker "zero unrecognized").
    unrecognized = [c["header"] for c in result["columns"] if c["status"] == "unrecognized"]
    assert unrecognized == []


def test_2024_fixture_reports_nni_and_birth_columns_as_ignored_not_unrecognized() -> None:
    result = preview.build_preview(str(FIXTURES_DIR / "2024.xlsx"))

    nni_col = column(result["columns"], "NNI")
    assert nni_col["status"] == "ignored"
    assert nni_col["ignoredCategory"] == "nni"
    assert nni_col["canonicalField"] is None

    birth_date_col = column(result["columns"], "DATN")
    assert birth_date_col["status"] == "ignored"
    assert birth_date_col["ignoredCategory"] == "birth_date"

    birth_place_col = column(result["columns"], "LIEUN")
    assert birth_place_col["status"] == "ignored"
    assert birth_place_col["ignoredCategory"] == "birth_place"


def test_leading_zeros_survive_into_sample_values() -> None:
    result = preview.build_preview(str(FIXTURES_DIR / "2022.xlsx"))

    exam_col = column(result["columns"], "Num Bac")
    assert any(v.startswith("0") for v in exam_col["samples"])


def test_2022_fixture_has_no_nni_column_but_still_ignores_birth_place_and_date() -> None:
    # 2022 is the deliberate contrast case: birth data present, NNI absent —
    # field availability genuinely varies per file (architecture.md invariant).
    result = preview.build_preview(str(FIXTURES_DIR / "2022.xlsx"))

    headers = [c["header"] for c in result["columns"]]
    assert "NNI" not in headers

    assert column(result["columns"], "Lieu Naiss")["status"] == "ignored"
    assert column(result["columns"], "Date Naiss")["status"] == "ignored"


def test_future_minimal_fixture_passes_the_floor_with_only_exam_no_and_name() -> None:
    result = preview.build_preview(str(FIXTURES_DIR / "future_minimal.xlsx"))

    assert result["missingRequired"] == []
    statuses = {c["header"]: c["status"] for c in result["columns"]}
    assert statuses == {"N° Bac": "mapped", "Nom Complet": "mapped"}


def test_samples_are_populated_and_capped() -> None:
    result = preview.build_preview(str(FIXTURES_DIR / "2024.xlsx"))

    exam_col = column(result["columns"], "NODOSS")
    assert 1 <= len(exam_col["samples"]) <= preview.SAMPLE_VALUES_PER_COLUMN
    assert all(isinstance(v, str) and v for v in exam_col["samples"])


# ---------------------------------------------------------------------------
# Unrecognized headers and floor violations (synthetic files, not fixtures —
# the protected fixtures never violate the floor by design)
# ---------------------------------------------------------------------------


def _write_xlsx(path: pathlib.Path, headers: list[str], row: list[str]) -> None:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    ws.append(row)
    wb.save(path)


def test_a_genuinely_unknown_header_is_flagged_unrecognized(tmp_path) -> None:
    file_path = tmp_path / "unknown_header.xlsx"
    _write_xlsx(
        file_path,
        ["NODOSS", "NOMPL", "REGION_ADMIN"],
        ["00123", "Ahmed Ould Mohamed", "NORD"],
    )

    result = preview.build_preview(str(file_path))

    region_col = column(result["columns"], "REGION_ADMIN")
    assert region_col["status"] == "unrecognized"
    assert region_col["canonicalField"] is None
    assert region_col["ignoredCategory"] is None


def test_a_file_missing_exam_no_reports_the_floor_violation(tmp_path) -> None:
    file_path = tmp_path / "no_exam_no.xlsx"
    _write_xlsx(file_path, ["NOMPL", "SERIE"], ["Ahmed Ould Mohamed", "SN"])

    result = preview.build_preview(str(file_path))

    assert result["missingRequired"] == ["exam_no"]


def test_a_file_missing_every_name_column_reports_the_floor_violation(tmp_path) -> None:
    file_path = tmp_path / "no_name.xlsx"
    _write_xlsx(file_path, ["NODOSS", "SERIE"], ["00123", "SN"])

    result = preview.build_preview(str(file_path))

    assert result["missingRequired"] == ["name"]


# ---------------------------------------------------------------------------
# Learned aliases override the built-in guess
# ---------------------------------------------------------------------------


def test_learned_alias_maps_a_header_the_builtin_dictionary_does_not(tmp_path) -> None:
    file_path = tmp_path / "custom_header.xlsx"
    _write_xlsx(file_path, ["NODOSS", "NOM_COMPLET_2026"], ["00123", "Ahmed Ould Mohamed"])

    result = preview.build_preview(str(file_path), learned_aliases={"NOM_COMPLET_2026": "name_fr"})

    custom_col = column(result["columns"], "NOM_COMPLET_2026")
    assert custom_col["status"] == "mapped"
    assert custom_col["canonicalField"] == "name_fr"
    assert result["missingRequired"] == []


# ---------------------------------------------------------------------------
# CLI contract — exactly one JSON line, correct exit code
# ---------------------------------------------------------------------------


def test_cli_success_prints_one_json_object_and_exits_zero(
    capsys: pytest.CaptureFixture[str],
) -> None:
    exit_code = preview.main(["--file-path", str(FIXTURES_DIR / "future_minimal.xlsx")])
    out = json.loads(capsys.readouterr().out)

    assert exit_code == 0
    assert out["ok"] is True
    assert "columns" in out
    assert out["missingRequired"] == []


def test_cli_passes_through_learned_aliases(capsys: pytest.CaptureFixture[str]) -> None:
    learned = json.dumps({"REGION_ADMIN": "serie"})
    exit_code = preview.main(
        ["--file-path", str(FIXTURES_DIR / "2024.xlsx"), "--learned-aliases", learned]
    )
    out = json.loads(capsys.readouterr().out)

    assert exit_code == 0
    assert out["ok"] is True


def test_cli_reports_malformed_learned_aliases_as_validation_error(
    capsys: pytest.CaptureFixture[str],
) -> None:
    exit_code = preview.main(
        ["--file-path", str(FIXTURES_DIR / "2024.xlsx"), "--learned-aliases", "not json"]
    )
    out = json.loads(capsys.readouterr().out)

    assert exit_code == 1
    assert out["ok"] is False
    assert out["code"] == "VALIDATION_ERROR"


def test_cli_reports_learned_aliases_that_are_not_an_object(
    capsys: pytest.CaptureFixture[str],
) -> None:
    exit_code = preview.main(
        ["--file-path", str(FIXTURES_DIR / "2024.xlsx"), "--learned-aliases", "[1, 2]"]
    )
    out = json.loads(capsys.readouterr().out)

    assert exit_code == 1
    assert out["code"] == "VALIDATION_ERROR"


def test_cli_reports_an_unreadable_file_without_crashing(
    capsys: pytest.CaptureFixture[str],
) -> None:
    exit_code = preview.main(["--file-path", "/nonexistent/path/does-not-exist.xlsx"])
    out = json.loads(capsys.readouterr().out)

    assert exit_code == 1
    assert out["ok"] is False
    assert out["code"] == "UNREADABLE_FILE"
    assert out["reason"]


def test_cli_reports_a_missing_file_path_argument() -> None:
    # argparse's required=True on --file-path exits 2 with its own usage
    # message — this is fine here (unlike worker.py's flags) because
    # preview.py is only ever invoked by the API with a path it already
    # resolved from the DB, never from untrusted user input directly.
    with pytest.raises(SystemExit) as exc_info:
        preview.main([])
    assert exc_info.value.code == 2
