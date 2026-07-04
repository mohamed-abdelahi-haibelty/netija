"""Tests for mapping.py: header recognition, the guaranteed-floor check,
and learned-alias overrides — the riskiest part of the import pipeline per
testing.md.
"""

import pathlib

import pandas as pd
import pytest

from mapping import analyze_headers, banned_pii_headers, build_alias_dictionary, normalize_header

FIXTURES_DIR = pathlib.Path(__file__).parent / "fixtures"

# header -> expected canonical field, for every column that must be
# auto-mapped (kept in sync with fixtures/README.md's "Ignored columns
# present" / stored-columns table).
EXPECTED_MAPPED_FIELDS = {
    "2024": {
        "NODOSS": "exam_no",
        "NOMPL": "name_fr",
        "NOMPA": "name_ar",
        "SERIE": "serie",
        "MOYBAC": "moyenne",
        "Decision": "decision",
    },
    "2023": {
        "NODOSS": "exam_no",
        "NOMPL": "name_fr",
        "NOMPA": "name_ar",
        "SERIE": "serie",
        "MOYBAC": "moyenne",
        "Decision": "decision",
    },
    "2022": {
        "Num Bac": "exam_no",
        "Nom": "name_fr",
        "Nom Ar": "name_ar",
        "SERIE": "serie",
        "Moy Bac": "moyenne",
        "decision": "decision",
    },
    "2021": {
        "Numéro Bac": "exam_no",
        "Nom": "name_fr",
        "Nom Arabe": "name_ar",
        "SERIE": "serie",
        "MoyBac": "moyenne",
        "Decision": "decision",
    },
    "2020": {
        "Numero Bac": "exam_no",
        "Nom": "name_fr",
        "SERIE": "serie",
        "Moyenne Bac": "moyenne",
        "Decision": "decision",
    },
    "2019": {
        "Numéro Bac": "exam_no",
        "Nom": "name_fr",
        "SERIE": "serie",
        "Moyenne": "moyenne",
        "Decision": "decision",
    },
    "2018": {
        "NODOSS": "exam_no",
        "NOMPL": "name_fr",
        "SERIE": "serie",
        "MOYG1": "moyenne",
        "Decision": "decision",
    },
    "2017": {
        "NODOSS": "exam_no",
        "NOMPL": "name_fr",
        "SERIE": "serie",
        "Moyg1": "moyenne",
        "Décision": "decision",
    },
    "2015": {
        "NODOSS": "exam_no",
        "NOMPL": "name_fr",
        "SERIE": "serie",
        "MOYG1": "moyenne",
        "decision": "decision",
    },
    "future_minimal": {
        "N° Bac": "exam_no",
        "Nom Complet": "name_fr",
    },
}

# Headers each fixture carries that must be reported as ignored — never
# unrecognized, and never mapped to a canonical field.
EXPECTED_IGNORED_HEADERS = {
    "2024": {
        "NNI",
        "LIEUN",
        "DATN",
        "LIEUNA",
        "Libnoets",
        "Libnoetce",
        "WILAYA_FR",
        "WILAYA_AR",
        "LibnoetsAR",
        "LibnoetceAR",
    },
    "2023": {
        "NNI",
        "LIEUN",
        "DATN",
        "LIEUNA",
        "Libnoets",
        "Libnoetce",
        "WILAYA_FR",
        "WILAYA_AR",
        "LibnoetsAR",
        "LibnoetceAR",
    },
    "2022": {
        "Lieu Naiss",
        "Date Naiss",
        "Lieu Ar",
        "Type Candidature",
        "Motif",
        "Noreg",
        "Wilaya",
        "Wilaya Ar",
        "Centre",
        "Centre Ar",
        "Etablissement",
        "Etablissement AR",
    },
    "2021": {
        "NOREG",
        "Code",
        "Centre",
        "NNI",
        "Lieu Naiss",
        "Lieu Arabe",
        "Date Naiss",
        "Ecole",
    },
    "2020": {"NNI"},
    "2019": {"Code Wilaya", "Wilaya", "Centre", "Date Naissance", "Lieu Naissance"},
    "2018": {"TYPEC", "DATN", "LIEUN", "Libecole", "Libcentre", "Noreg", "Wilaya"},
    "2017": {"TYPEC", "DATN", "LIEUN", "NOREG", "LETAB"},
    "2015": {"DATN", "LIEUN", "LETAB"},
    "future_minimal": set(),
}


@pytest.mark.parametrize("name", sorted(EXPECTED_MAPPED_FIELDS))
def test_fixture_auto_maps_its_minimal_fields(name: str) -> None:
    df = pd.read_excel(FIXTURES_DIR / f"{name}.xlsx", dtype=str)
    analysis = analyze_headers(list(df.columns))

    assert analysis.mapping == EXPECTED_MAPPED_FIELDS[name]


@pytest.mark.parametrize("name", sorted(EXPECTED_IGNORED_HEADERS))
def test_fixture_ignored_columns_are_reported_not_unrecognized(name: str) -> None:
    df = pd.read_excel(FIXTURES_DIR / f"{name}.xlsx", dtype=str)
    analysis = analyze_headers(list(df.columns))

    assert set(analysis.ignored) == EXPECTED_IGNORED_HEADERS[name]
    assert analysis.unrecognized == []


@pytest.mark.parametrize("name", sorted(EXPECTED_MAPPED_FIELDS))
def test_every_historical_fixture_passes_the_floor(name: str) -> None:
    df = pd.read_excel(FIXTURES_DIR / f"{name}.xlsx", dtype=str)
    analysis = analyze_headers(list(df.columns))

    assert analysis.passes_floor
    assert analysis.missing_required == []


def test_future_minimal_passes_the_floor_with_only_exam_no_and_one_name() -> None:
    df = pd.read_excel(FIXTURES_DIR / "future_minimal.xlsx", dtype=str)
    analysis = analyze_headers(list(df.columns))

    assert analysis.mapping == {"N° Bac": "exam_no", "Nom Complet": "name_fr"}
    assert analysis.passes_floor


def test_missing_exam_no_column_fails_the_floor_naming_exam_no() -> None:
    analysis = analyze_headers(["Nom", "SERIE", "Decision"])

    assert not analysis.passes_floor
    assert analysis.missing_required == ["exam_no"]


def test_missing_all_name_columns_fails_the_floor_naming_name() -> None:
    analysis = analyze_headers(["NODOSS", "SERIE", "Decision"])

    assert not analysis.passes_floor
    assert analysis.missing_required == ["name"]


def test_missing_both_exam_no_and_name_reports_both() -> None:
    analysis = analyze_headers(["SERIE", "Decision"])

    assert analysis.missing_required == ["exam_no", "name"]


def test_at_least_one_of_name_fr_or_name_ar_satisfies_the_floor() -> None:
    # Only an Arabic name column, no French one — the floor only needs one.
    analysis = analyze_headers(["NODOSS", "NOMPA"])

    assert analysis.passes_floor
    assert analysis.mapping == {"NODOSS": "exam_no", "NOMPA": "name_ar"}


def test_field_availability_is_derived_from_headers_not_a_year_parameter() -> None:
    # analyze_headers has no year/format concept at all — passing the exact
    # same header list must always produce the exact same analysis,
    # regardless of which year's file it came from.
    headers = ["NODOSS", "NOMPL", "SERIE"]
    assert analyze_headers(headers) == analyze_headers(headers)


def test_a_genuinely_unknown_header_is_reported_as_unrecognized() -> None:
    analysis = analyze_headers(["NODOSS", "NOMPL", "SOME_FUTURE_COLUMN"])

    assert analysis.unrecognized == ["SOME_FUTURE_COLUMN"]
    assert "SOME_FUTURE_COLUMN" not in analysis.mapping
    assert "SOME_FUTURE_COLUMN" not in analysis.ignored


def test_learned_alias_maps_a_header_the_builtin_dictionary_does_not_know() -> None:
    # Simulates an admin's manual remap from a prior import being persisted
    # to column_aliases and honored on the next file with the same header —
    # no code change required.
    analysis = analyze_headers(
        ["RESULTAT", "NODOSS", "NOMPL"],
        learned_aliases={"RESULTAT": "decision"},
    )

    assert analysis.mapping["RESULTAT"] == "decision"
    assert analysis.unrecognized == []


def test_learned_alias_overrides_a_conflicting_builtin_guess() -> None:
    analysis = analyze_headers(["Nom"], learned_aliases={"Nom": "name_ar"})

    assert analysis.mapping == {"Nom": "name_ar"}


def test_learned_alias_matches_regardless_of_header_casing_or_accents() -> None:
    # Learned aliases are normalized on the way in, same as builtin ones, so
    # a re-uploaded file with slightly different capitalization still hits
    # the same learned entry.
    analysis = analyze_headers(["résultat"], learned_aliases={"RESULTAT": "decision"})

    assert analysis.mapping == {"résultat": "decision"}


def test_build_alias_dictionary_merges_without_mutating_the_builtin_dict() -> None:
    merged = build_alias_dictionary({"RESULTAT": "decision"})

    assert merged["resultat"] == "decision"
    assert merged["nodoss"] == "exam_no"  # builtin entries still present
    assert "resultat" not in build_alias_dictionary(None)  # builtin dict untouched


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Numéro Bac", "numero bac"),
        ("Numero Bac", "numero bac"),
        ("N° Bac", "n bac"),
        ("WILAYA_FR", "wilaya fr"),
        ("  Décision  ", "decision"),
        ("decision", "decision"),
    ],
)
def test_normalize_header_collapses_accents_case_and_punctuation(raw: str, expected: str) -> None:
    assert normalize_header(raw) == expected


# ---------------------------------------------------------------------------
# banned_pii_headers — architecture.md: "never stores NNI, birth date, or
# birth place at all" (school/wilaya join that group per progress-tracker's
# 013b resolved ambiguity). Used to redact the raw-row copy a rejected row
# keeps for the admin audit trail (worker.py), which must not carry these
# any more than a successfully inserted attempt does.
# ---------------------------------------------------------------------------


def test_banned_pii_headers_flags_every_privacy_banned_category() -> None:
    headers = [
        "NNI",
        "DATN",
        "Lieu Naiss",
        "LIEUNA",
        "Wilaya",
        "Etablissement",
        "NODOSS",  # canonical — never banned
        "Motif",  # ignored, but not in the banned-category list
        "SOME_FUTURE_COLUMN",  # unrecognized — never banned
    ]

    assert banned_pii_headers(headers) == {
        "NNI",
        "DATN",
        "Lieu Naiss",
        "LIEUNA",
        "Wilaya",
        "Etablissement",
    }


def test_banned_pii_headers_leaves_non_privacy_ignored_categories_alone() -> None:
    # Noreg (registration_no), Type Candidature (candidature_type), and
    # Motif (rejection_reason) are recognized-but-ignored, same as PII
    # columns — but they aren't a privacy invariant, so they may stay in a
    # reject's raw audit copy.
    assert banned_pii_headers(["Noreg", "Type Candidature", "Motif", "Centre"]) == set()
