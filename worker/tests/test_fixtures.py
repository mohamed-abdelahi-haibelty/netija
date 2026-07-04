"""Smoke test: every fixture opens cleanly and has exactly the headers
documented in fixtures/README.md — including the NNI/birth columns that
are present in the file but will be dropped by the mapping/cleaning
modules (016/017), not by pandas at read time.
"""

import pathlib

import pandas as pd
import pytest

FIXTURES_DIR = pathlib.Path(__file__).parent / "fixtures"

# name -> expected header list, in file order. Kept in sync with fixtures/README.md.
# These layouts mirror real historical export headers (column names/order/
# presence), not just a plausible guess.
EXPECTED_HEADERS = {
    "2024": [
        "NNI",
        "NODOSS",
        "SERIE",
        "NOMPL",
        "LIEUN",
        "DATN",
        "NOMPA",
        "LIEUNA",
        "MOYBAC",
        "Libnoets",
        "Libnoetce",
        "Decision",
        "WILAYA_FR",
        "WILAYA_AR",
        "LibnoetsAR",
        "LibnoetceAR",
    ],
    "2023": [
        "NNI",
        "NODOSS",
        "SERIE",
        "NOMPL",
        "LIEUN",
        "DATN",
        "NOMPA",
        "LIEUNA",
        "MOYBAC",
        "Libnoets",
        "Libnoetce",
        "Decision",
        "WILAYA_FR",
        "WILAYA_AR",
        "LibnoetsAR",
        "LibnoetceAR",
    ],
    "2022": [
        "Num Bac",
        "Nom",
        "Lieu Naiss",
        "Date Naiss",
        "Nom Ar",
        "Lieu Ar",
        "Type Candidature",
        "SERIE",
        "Moy Bac",
        "decision",
        "Motif",
        "Noreg",
        "Wilaya",
        "Wilaya Ar",
        "Centre",
        "Centre Ar",
        "Etablissement",
        "Etablissement AR",
    ],
    "2021": [
        "NOREG",
        "Code",
        "Centre",
        "NNI",
        "Numéro Bac",
        "SERIE",
        "Nom Arabe",
        "Nom",
        "Lieu Naiss",
        "Lieu Arabe",
        "MoyBac",
        "Decision",
        "Date Naiss",
        "Ecole",
    ],
    "2020": ["NNI", "Numero Bac", "Nom", "SERIE", "Moyenne Bac", "Decision"],
    "2019": [
        "Code Wilaya",
        "Wilaya",
        "Centre",
        "SERIE",
        "Numéro Bac",
        "Nom",
        "Date Naissance",
        "Lieu Naissance",
        "Moyenne",
        "Decision",
    ],
    "2018": [
        "NODOSS",
        "SERIE",
        "TYPEC",
        "NOMPL",
        "DATN",
        "MOYG1",
        "LIEUN",
        "Decision",
        "Libecole",
        "Libcentre",
        "Noreg",
        "Wilaya",
    ],
    "2017": [
        "NODOSS",
        "SERIE",
        "TYPEC",
        "NOMPL",
        "DATN",
        "LIEUN",
        "Moyg1",
        "Décision",
        "NOREG",
        "LETAB",
    ],
    "2015": ["NODOSS", "NOMPL", "DATN", "LIEUN", "SERIE", "LETAB", "MOYG1", "decision"],
    "future_minimal": ["N° Bac", "Nom Complet"],
}

MIN_ROWS = 5
MAX_ROWS = 10


@pytest.mark.parametrize("name", sorted(EXPECTED_HEADERS))
def test_fixture_has_expected_headers(name: str) -> None:
    path = FIXTURES_DIR / f"{name}.xlsx"
    assert path.exists(), f"missing fixture: {path}"

    # dtype=str mirrors how the real pipeline will read every fixture: as text,
    # so leading zeros on exam numbers are never silently lost to numeric coercion.
    df = pd.read_excel(path, dtype=str)

    assert list(df.columns) == EXPECTED_HEADERS[name]
    assert MIN_ROWS <= len(df) <= MAX_ROWS


def test_every_fixture_file_is_covered_by_an_expectation() -> None:
    on_disk = {p.stem for p in FIXTURES_DIR.glob("*.xlsx")}
    assert on_disk == set(EXPECTED_HEADERS)


EXAM_NO_COLUMN = {
    "2022": "Num Bac",
    "2021": "Numéro Bac",
    "2020": "Numero Bac",
    "2018": "NODOSS",
    "future_minimal": "N° Bac",
}


@pytest.mark.parametrize("name", sorted(EXAM_NO_COLUMN))
def test_leading_zero_exam_numbers_survive_dtype_str_read(name: str) -> None:
    df = pd.read_excel(FIXTURES_DIR / f"{name}.xlsx", dtype=str)
    assert any(value.startswith("0") for value in df[EXAM_NO_COLUMN[name]])
