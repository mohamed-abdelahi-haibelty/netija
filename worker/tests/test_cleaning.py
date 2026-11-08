"""Tests for cleaning.py: decision normalization, leading-zero preservation,
the importable-vs-rejected split, and that birth/NNI data never reaches a
cleaned row — the riskiest part of the import pipeline per testing.md.
"""

import pathlib

import pandas as pd
import pytest

from cleaning import (
    DECISION_VALUES,
    CleanRow,
    clean_dataframe,
    normalize_decision,
)
from mapping import analyze_headers

FIXTURES_DIR = pathlib.Path(__file__).parent / "fixtures"

EXAM_YEAR = 2024


def _mapped(df: pd.DataFrame) -> dict[str, str]:
    return analyze_headers(list(df.columns)).mapping


# ---------------------------------------------------------------------------
# Decision normalization — every observed historical variant.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Admis", "Admis"),
        ("Admis Sn", "Admis"),
        ("Admis(e)", "Admis"),  # 2025 file: gendered variant
        ("Ajourné", "Ajourné"),
        ("Ajourné(e)", "Ajourné"),
        ("Ajourné Sn", "Ajourné"),
        ("Sessionnaire", "Sessionnaire"),
        ("Sessionaire", "Sessionnaire"),  # real-file typo
        ("Absent", "Absent"),
        ("Absent(e)", "Absent"),  # 2025 file: gendered variant
        ("Abscent", "Absent"),  # real-file typo
        ("Délibérable", "Délibérable"),
        ("Delibérable", "Délibérable"),  # unaccented spelling
        ("Delibérable Sn", "Délibérable"),
        ("Examen annulé CT (Usage du Téléphone)", "Annulé"),
        ("Examen annulé CT (Autre motif)", "Annulé"),  # variable reason, same prefix
        ("Annulation de l’examen", "Annulé"),  # 2025 file: reversed phrasing, curly apostrophe
        ("Annulation de l'examen", "Annulé"),  # same, straight apostrophe
        ("إلغاء الامتحان", "Annulé"),  # 2022 file: Arabic "cancellation of the exam"
        ("Eliminé", "Eliminé"),  # 2025 Brevet file: own enum value, distinct from Ajourné/Annulé
        ("  admis  ", "Admis"),  # whitespace/casing tolerant
    ],
)
def test_normalize_decision_maps_every_known_variant(raw: str, expected: str) -> None:
    assert normalize_decision(raw) == expected


def test_normalize_decision_flags_an_unknown_variant_instead_of_guessing() -> None:
    assert normalize_decision("Reçu") is None
    assert normalize_decision("") is None


# ---------------------------------------------------------------------------
# exam_no: leading zeros preserved, validated as a bounded digit string.
# ---------------------------------------------------------------------------


def test_leading_zeros_on_exam_no_are_preserved() -> None:
    df = pd.DataFrame(
        {"NODOSS": ["00087"], "NOMPL": ["Ahmed"], "SERIE": ["SN"], "Decision": ["Admis"]}
    )
    result = clean_dataframe(df, _mapped(df), EXAM_YEAR, "bac")

    assert result.rows == [
        CleanRow(
            exam_year=EXAM_YEAR,
            exam_no="00087",
            name_fr="Ahmed",
            name_ar=None,
            serie="SN",
            decision="Admis",
            decision_raw="Admis",
            moyenne=None,
        )
    ]


def test_exam_no_is_never_coerced_to_a_number() -> None:
    df = pd.DataFrame(
        {"NODOSS": ["00087"], "NOMPL": ["Ahmed"], "SERIE": ["SN"], "Decision": ["Admis"]}
    )
    result = clean_dataframe(df, _mapped(df), EXAM_YEAR, "bac")

    assert isinstance(result.rows[0].exam_no, str)
    assert result.rows[0].exam_no == "00087"


def test_non_digit_exam_no_is_rejected_not_hardcoded_to_five_digits() -> None:
    # A 3-digit and an 8-digit exam number both pass; only non-digit content fails.
    df = pd.DataFrame(
        {
            "NODOSS": ["007", "12345678", "12A45"],
            "NOMPL": ["Ahmed", "Fatimetou", "Sid'Ahmed"],
            "SERIE": ["SN", "LM", "M"],
            "Decision": ["Admis", "Admis", "Admis"],
        }
    )
    result = clean_dataframe(df, _mapped(df), EXAM_YEAR, "bac")

    assert [r.exam_no for r in result.rows] == ["007", "12345678"]
    assert len(result.rejects) == 1
    assert result.rejects[0].column == "exam_no"
    assert result.rejects[0].row_number == 3


def test_missing_exam_no_is_rejected() -> None:
    df = pd.DataFrame(
        {"NODOSS": [None], "NOMPL": ["Ahmed"], "SERIE": ["SN"], "Decision": ["Admis"]}
    )
    result = clean_dataframe(df, _mapped(df), EXAM_YEAR, "bac")

    assert result.rows == []
    assert result.rejects[0].column == "exam_no"
    assert result.rejects[0].reason == "missing exam_no"


# ---------------------------------------------------------------------------
# Importable-vs-rejected split with reasons.
# ---------------------------------------------------------------------------


def test_row_missing_all_names_is_rejected_naming_name() -> None:
    df = pd.DataFrame(
        {"NODOSS": ["00001"], "NOMPL": [None], "SERIE": ["SN"], "Decision": ["Admis"]}
    )
    result = clean_dataframe(df, _mapped(df), EXAM_YEAR, "bac")

    assert result.rows == []
    assert result.rejects[0].column == "name"


def test_row_missing_serie_is_rejected() -> None:
    df = pd.DataFrame(
        {"NODOSS": ["00001"], "NOMPL": ["Ahmed"], "SERIE": [None], "Decision": ["Admis"]}
    )
    result = clean_dataframe(df, _mapped(df), EXAM_YEAR, "bac")

    assert result.rows == []
    assert result.rejects[0].column == "serie"


# ---------------------------------------------------------------------------
# Brevet: no serie (track). Serie is never required and any mapped serie
# column is ignored — the "required for bac, absent/ignored for brevet" rule.
# ---------------------------------------------------------------------------


def test_brevet_row_without_a_serie_column_imports_with_null_serie() -> None:
    # A Brevet file need not carry serie at all — the row must NOT be rejected
    # the way a Bac row missing serie is (contrast test_row_missing_serie...).
    df = pd.DataFrame({"NODOSS": ["00001"], "NOMPL": ["Ahmed"], "Decision": ["Admis"]})
    result = clean_dataframe(df, _mapped(df), EXAM_YEAR, "brevet")

    assert result.rejects == []
    assert len(result.rows) == 1
    assert result.rows[0].serie is None


def test_brevet_import_ignores_a_present_serie_column() -> None:
    # Even when a serie column IS present and mapped, Brevet stores null: the
    # track concept doesn't exist for the Brevet, so any value is dropped.
    df = pd.DataFrame(
        {"NODOSS": ["00001"], "NOMPL": ["Ahmed"], "SERIE": ["SN"], "Decision": ["Admis"]}
    )
    result = clean_dataframe(df, _mapped(df), EXAM_YEAR, "brevet")

    assert result.rejects == []
    assert result.rows[0].serie is None


def test_row_missing_decision_is_rejected() -> None:
    df = pd.DataFrame(
        {"NODOSS": ["00001"], "NOMPL": ["Ahmed"], "SERIE": ["SN"], "Decision": [None]}
    )
    result = clean_dataframe(df, _mapped(df), EXAM_YEAR, "bac")

    assert result.rows == []
    assert result.rejects[0].column == "decision"


def test_row_with_unrecognized_decision_variant_is_rejected_not_silently_passed() -> None:
    df = pd.DataFrame(
        {"NODOSS": ["00001"], "NOMPL": ["Ahmed"], "SERIE": ["SN"], "Decision": ["Reçu"]}
    )
    result = clean_dataframe(df, _mapped(df), EXAM_YEAR, "bac")

    assert result.rows == []
    assert result.rejects[0].column == "decision"
    assert "Reçu" in result.rejects[0].reason


def test_row_with_non_numeric_moyenne_is_rejected() -> None:
    df = pd.DataFrame(
        {
            "NODOSS": ["00001"],
            "NOMPL": ["Ahmed"],
            "SERIE": ["SN"],
            "MOYBAC": ["N/A"],
            "Decision": ["Admis"],
        }
    )
    result = clean_dataframe(df, _mapped(df), EXAM_YEAR, "bac")

    assert result.rows == []
    assert result.rejects[0].column == "moyenne"


def test_row_with_out_of_range_moyenne_is_rejected_as_impossible() -> None:
    df = pd.DataFrame(
        {
            "NODOSS": ["00001"],
            "NOMPL": ["Ahmed"],
            "SERIE": ["SN"],
            "MOYBAC": ["25"],
            "Decision": ["Admis"],
        }
    )
    result = clean_dataframe(df, _mapped(df), EXAM_YEAR, "bac")

    assert result.rows == []
    assert result.rejects[0].column == "moyenne"


def test_moyenne_boundaries_zero_and_twenty_are_valid() -> None:
    df = pd.DataFrame(
        {
            "NODOSS": ["00001", "00002"],
            "NOMPL": ["Ahmed", "Fatimetou"],
            "SERIE": ["SN", "SN"],
            "MOYBAC": ["00.000000000", "20"],
            "Decision": ["Ajourné", "Admis"],
        }
    )
    result = clean_dataframe(df, _mapped(df), EXAM_YEAR, "bac")

    assert [r.moyenne for r in result.rows] == [0.0, 20.0]
    assert result.rejects == []


def test_blank_moyenne_is_valid_not_rejected_eg_annule_or_absent_rows() -> None:
    df = pd.DataFrame(
        {
            "NODOSS": ["00001"],
            "NOMPL": ["Ahmed"],
            "SERIE": ["SN"],
            "MOYBAC": [None],
            "Decision": ["Absent"],
        }
    )
    result = clean_dataframe(df, _mapped(df), EXAM_YEAR, "bac")

    assert result.rejects == []
    assert result.rows[0].moyenne is None
    assert result.rows[0].decision == "Absent"


def test_valid_and_invalid_rows_in_the_same_file_split_and_both_are_counted() -> None:
    df = pd.DataFrame(
        {
            "NODOSS": ["00001", None, "00003"],
            "NOMPL": ["Ahmed", "Fatimetou", "Sid'Ahmed"],
            "SERIE": ["SN", "LM", "M"],
            "Decision": ["Admis", "Ajourné", "Reçu"],
        }
    )
    result = clean_dataframe(df, _mapped(df), EXAM_YEAR, "bac")

    assert result.counts == {"importable": 1, "rejected": 2}
    assert [r.exam_no for r in result.rows] == ["00001"]
    assert [r.row_number for r in result.rejects] == [2, 3]


def test_two_headers_mapped_to_the_same_field_both_resolve_their_own_rows() -> None:
    """Reproduces a real bug found via a production BEPC 2024 re-import:
    worker.py concatenates multiple sheets into one DataFrame (see its
    docstring), and two sheets can use different header spellings for the
    same concept — e.g. sheet 1's "name" vs. sheet 2's "NOMPL", both mapped
    to name_fr. pd.concat's outer join means each row has a real value under
    exactly one of those two headers and NaN under the other (the column
    only exists on the other sheet). Collapsing header->field to a single
    field->header reverse mapping silently dropped whichever header lost the
    collision — every row using it was misread as missing that field
    (confirmed against real production reject data: 68,553 rows, all with a
    real name under "name", rejected as "missing name" because "NOMPL" won
    the collision and was NaN for every one of them).
    """
    df = pd.DataFrame(
        {
            "name": ["Fatimetou Yahia El Bane", None],
            "NOMPL": [None, "Aminetou Cheikh Ahmed"],
            "NODOSS": ["00001", "00002"],
            "Decision": ["Admis", "Admis"],
        }
    )
    mapping = {"name": "name_fr", "NOMPL": "name_fr", "NODOSS": "exam_no", "Decision": "decision"}

    result = clean_dataframe(df, mapping, EXAM_YEAR, "brevet")

    assert result.counts == {"importable": 2, "rejected": 0}
    assert [r.name_fr for r in result.rows] == ["Fatimetou Yahia El Bane", "Aminetou Cheikh Ahmed"]


# ---------------------------------------------------------------------------
# Name and serie cleaning.
# ---------------------------------------------------------------------------


def test_name_and_serie_text_is_trimmed_and_whitespace_collapsed() -> None:
    df = pd.DataFrame(
        {
            "NODOSS": ["00001"],
            "NOMPL": ["  Sid'Ahmed   Ould  Mohamed "],
            "SERIE": [" sn "],
            "Decision": ["Admis"],
        }
    )
    result = clean_dataframe(df, _mapped(df), EXAM_YEAR, "bac")

    assert result.rows[0].name_fr == "Sid'Ahmed Ould Mohamed"
    assert result.rows[0].serie == "SN"


def test_serie_casing_is_normalized_but_typos_pass_through_verbatim() -> None:
    # 2020's raw SERIE casing ("sn", "Lo") is normalized; 2022's real typos
    # ("SNE", "ME", "LME") are kept as-is — SERIE is never validated
    # against a fixed enum (architecture.md).
    df = pd.DataFrame(
        {
            "NODOSS": ["00001", "00002", "00003"],
            "NOMPL": ["A", "B", "C"],
            "SERIE": ["sn", "Lo", "SNE"],
            "Decision": ["Admis", "Admis", "Admis"],
        }
    )
    result = clean_dataframe(df, _mapped(df), EXAM_YEAR, "bac")

    assert [r.serie for r in result.rows] == ["SN", "LO", "SNE"]


# ---------------------------------------------------------------------------
# NNI / birth date / birth place: never parsed, dropped if present.
# ---------------------------------------------------------------------------


def test_ignored_columns_never_reach_a_cleaned_row_even_if_present_in_the_file() -> None:
    # Sanity check that CleanRow has no slot for them at all — a
    # structural guarantee, not just a runtime behavior.
    assert not hasattr(CleanRow, "nni")
    assert not hasattr(CleanRow, "birth_date")
    assert not hasattr(CleanRow, "birth_place")

    df = pd.DataFrame(
        {
            "NNI": ["1234567890"],
            "DATN": ["01/01/2000"],
            "LIEUN": ["Nouakchott"],
            "NODOSS": ["00001"],
            "NOMPL": ["Ahmed"],
            "SERIE": ["SN"],
            "Decision": ["Admis"],
        }
    )
    result = clean_dataframe(df, _mapped(df), EXAM_YEAR, "bac")

    assert result.rejects == []
    row = result.rows[0]
    assert row == CleanRow(
        exam_year=EXAM_YEAR,
        exam_no="00001",
        name_fr="Ahmed",
        name_ar=None,
        serie="SN",
        decision="Admis",
        decision_raw="Admis",
        moyenne=None,
    )


@pytest.mark.parametrize(
    "name",
    ["2024", "2023", "2022", "2021", "2020", "2019", "2018", "2017", "2015"],
)
def test_every_historical_fixture_cleans_with_no_birth_or_nni_data_leaking_through(
    name: str,
) -> None:
    df = pd.read_excel(FIXTURES_DIR / f"{name}.xlsx", dtype=str)
    result = clean_dataframe(df, _mapped(df), EXAM_YEAR, "bac")

    assert result.counts["importable"] + result.counts["rejected"] == len(df)
    for row in result.rows:
        assert row.exam_year == EXAM_YEAR
        assert row.decision in DECISION_VALUES


def test_future_minimal_fixture_has_no_serie_or_decision_columns_so_every_row_is_rejected() -> None:
    df = pd.read_excel(FIXTURES_DIR / "future_minimal.xlsx", dtype=str)
    result = clean_dataframe(df, _mapped(df), EXAM_YEAR, "bac")

    # The guaranteed floor (exam_no + one name) is present, but serie and
    # decision are entirely absent columns — every row must be rejected,
    # not crash, per the fixture's own documented expectation.
    assert result.rows == []
    assert len(result.rejects) == len(df)
    assert all(r.column == "serie" for r in result.rejects)


# ---------------------------------------------------------------------------
# Determinism.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("name", ["2024", "2022", "2020", "future_minimal"])
def test_running_twice_on_the_same_fixture_yields_identical_output(name: str) -> None:
    df = pd.read_excel(FIXTURES_DIR / f"{name}.xlsx", dtype=str)
    mapping = _mapped(df)

    first = clean_dataframe(df, mapping, EXAM_YEAR, "bac")
    second = clean_dataframe(df, mapping, EXAM_YEAR, "bac")

    assert first == second
