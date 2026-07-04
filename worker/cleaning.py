"""Cleaning & normalization: turn a raw mapped DataFrame into clean, typed,
minimal rows ready to load.

This module never reads files itself (that is the loader's job, task 020) —
it receives a DataFrame that pandas already read with `dtype=str` (so
leading zeros and raw text survive untouched) plus the header->canonical
field `mapping` produced by `mapping.analyze_headers`. Because that mapping
only ever contains the 6 canonical fields (exam_no, name_fr, name_ar, serie,
moyenne, decision), any NNI/birth_date/birth_place/wilaya/school column in
the source file is never looked up here at all — it is dropped simply by
never appearing in `mapping`, not by any special-casing in this file.

Pure functions only (no pandas I/O, no Postgres), per code-standards.md's
"DataFrame/values in -> values out" rule. Row-level problems (missing
field, unparseable moyenne, unrecognized decision) are never exceptions:
each row is independently classified as importable or rejected-with-reason,
per error-handling.md's worker contract.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import NamedTuple

import pandas as pd

# A file is only guaranteed to have exam_no and at least one name column
# (architecture.md's "never trust the file's schema" invariant); serie,
# moyenne, and decision may be absent in some files without preventing the
# module from running — a row missing one of them is simply rejected below.
DECISION_VALUES = ("Admis", "Ajourné", "Sessionnaire", "Absent", "Délibérable", "Annulé")

# Sane bound, not a hardcoded exact length: every real historical export
# uses 5-digit exam numbers, but the validation must not assume that stays
# true forever (architecture.md).
EXAM_NO_MIN_LENGTH = 1
EXAM_NO_MAX_LENGTH = 15
_EXAM_NO_PATTERN = re.compile(rf"^\d{{{EXAM_NO_MIN_LENGTH},{EXAM_NO_MAX_LENGTH}}}$")

# Moyenne Générale is out of 20; anything outside this range is an
# impossible value, not a real grade.
MOYENNE_MIN = 0.0
MOYENNE_MAX = 20.0


def _fold(text: str) -> str:
    """Accent/case-insensitive lookup key, same technique as
    mapping.normalize_header: NFKD-decompose so an accented letter splits
    into its base letter plus a separate combining mark, then drop the
    combining marks. This is what makes "Délibérable" and "Delibérable"
    resolve to the identical key without listing both spellings by hand.
    Curly apostrophes (a real-file inconsistency, e.g. "l'examen" typed
    with U+2019) are normalized to a plain "'" so they match the same key
    as the straight-quote spelling.
    """
    decomposed = unicodedata.normalize("NFKD", text)
    without_accents = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    without_accents = without_accents.replace("’", "'").replace("‘", "'")
    return " ".join(without_accents.strip().lower().split())


# Every raw decision string observed across the historical fixtures (see
# worker/tests/fixtures/README.md), keyed by its folded form. "Sn" is a
# session-result suffix (e.g. "Admis Sn", "Ajourné Sn") that does not change
# the underlying decision, so the plain and "Sn"-suffixed forms both map to
# the same enum value.
DECISION_ALIASES: dict[str, str] = {
    "admis": "Admis",
    "admis sn": "Admis",
    "admis(e)": "Admis",  # gendered variant, same pattern as ajourne(e)
    "ajourne": "Ajourné",
    "ajourne(e)": "Ajourné",
    "ajourne sn": "Ajourné",
    "sessionnaire": "Sessionnaire",
    "sessionaire": "Sessionnaire",  # real-file typo (missing second "n")
    "absent": "Absent",
    "absent(e)": "Absent",  # gendered variant, same pattern as ajourne(e)
    "abscent": "Absent",  # real-file typo
    "deliberable": "Délibérable",
    "deliberable sn": "Délibérable",
    "annulation de l'examen": "Annulé",  # 2025 file: reversed phrasing of "examen annule..."
    # 2022 file: Arabic "cancellation of the exam". Key is the FOLDED form —
    # _fold's NFKD decomposition splits "إ" (alef+hamza-below) into a plain
    # alef plus a combining hamza mark, which then gets stripped like any
    # other combining mark, so the raw "إلغاء" folds to "الغاء" (no hamza).
    "الغاء الامتحان": "Annulé",
}

# "Examen annulé CT (...)" carries a variable reason in parentheses (e.g.
# "Usage du Téléphone"); matched by prefix so any cancellation reason still
# normalizes to Annulé instead of requiring a dictionary entry per reason.
_ANNULE_PREFIX = "examen annule"


def normalize_decision(raw: str) -> str | None:
    """Map a raw decision string to the fixed enum, or None if the variant
    is not recognized (the caller must flag this, never pass it through).
    """
    key = _fold(raw)
    if key in DECISION_ALIASES:
        return DECISION_ALIASES[key]
    if key.startswith(_ANNULE_PREFIX):
        return "Annulé"
    return None


def _clean_text(value: object) -> str | None:
    """Trim and collapse internal whitespace. `errors="coerce"`-style
    missing-cell handling: pandas represents a blank Excel cell as float
    `nan` even in a `dtype=str` column, so that has to be checked explicitly
    before calling `str()` on it (otherwise it becomes the text "nan").
    """
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    text = " ".join(str(value).strip().split())
    return text or None


def _validate_exam_no(value: object) -> tuple[str | None, str | None]:
    text = _clean_text(value)
    if text is None:
        return None, "missing exam_no"
    if not _EXAM_NO_PATTERN.match(text):
        bound = f"{EXAM_NO_MIN_LENGTH}-{EXAM_NO_MAX_LENGTH}"
        return None, f"exam_no is not a digit string of length {bound}: {text!r}"
    return text, None


def _clean_moyenne(value: object) -> tuple[float | None, str | None]:
    text = _clean_text(value)
    if text is None:
        return None, None  # absent moyenne is valid (e.g. Annulé/Absent rows)
    try:
        moyenne = float(text)
    except ValueError:
        return None, f"moyenne is not numeric: {text!r}"
    if not (MOYENNE_MIN <= moyenne <= MOYENNE_MAX):
        return None, f"moyenne {moyenne} is outside the 0-{int(MOYENNE_MAX)} range"
    return moyenne, None


@dataclass(frozen=True)
class CleanRow:
    exam_year: int
    exam_no: str
    name_fr: str | None
    name_ar: str | None
    serie: str
    decision: str
    decision_raw: str
    moyenne: float | None


@dataclass(frozen=True)
class RejectedRow:
    row_number: int  # 1-based, within this file's data rows (excludes header)
    reason: str
    column: str | None


@dataclass(frozen=True)
class CleaningResult:
    rows: list[CleanRow] = field(default_factory=list)
    rejects: list[RejectedRow] = field(default_factory=list)

    @property
    def counts(self) -> dict[str, int]:
        return {"importable": len(self.rows), "rejected": len(self.rejects)}


class _RowError(NamedTuple):
    reason: str
    column: str | None


def _field_value(
    raw_row: dict[str, object], field_to_header: dict[str, str], canonical_field: str
) -> object:
    header = field_to_header.get(canonical_field)
    if header is None:
        return None
    return raw_row.get(header)


def _clean_row(
    raw_row: dict[str, object],
    field_to_header: dict[str, str],
    exam_year: int,
) -> CleanRow | _RowError:
    exam_no, exam_no_error = _validate_exam_no(_field_value(raw_row, field_to_header, "exam_no"))
    if exam_no_error:
        return _RowError(exam_no_error, "exam_no")

    name_fr = _clean_text(_field_value(raw_row, field_to_header, "name_fr"))
    name_ar = _clean_text(_field_value(raw_row, field_to_header, "name_ar"))
    if name_fr is None and name_ar is None:
        return _RowError("missing name (both name_fr and name_ar are absent)", "name")

    serie_raw = _clean_text(_field_value(raw_row, field_to_header, "serie"))
    if serie_raw is None:
        return _RowError("missing serie", "serie")
    serie = (
        serie_raw.upper()
    )  # normalizes casing only (e.g. "sn" -> "SN"); typos like "SNE" pass through verbatim

    decision_raw = _clean_text(_field_value(raw_row, field_to_header, "decision"))
    if decision_raw is None:
        return _RowError("missing decision", "decision")
    decision = normalize_decision(decision_raw)
    if decision is None:
        return _RowError(f"unrecognized decision variant: {decision_raw!r}", "decision")

    moyenne, moyenne_error = _clean_moyenne(_field_value(raw_row, field_to_header, "moyenne"))
    if moyenne_error:
        return _RowError(moyenne_error, "moyenne")

    return CleanRow(
        exam_year=exam_year,
        exam_no=exam_no,
        name_fr=name_fr,
        name_ar=name_ar,
        serie=serie,
        decision=decision,
        decision_raw=decision_raw,
        moyenne=moyenne,
    )


def clean_dataframe(df: pd.DataFrame, mapping: dict[str, str], exam_year: int) -> CleaningResult:
    """Classify every row of a raw mapped DataFrame as importable or
    rejected-with-reason. `mapping` is `header -> canonical field`, exactly
    the shape `mapping.analyze_headers(...).mapping` produces; `exam_year`
    is set once per file at confirm time, not read from any column.

    `df.to_dict(orient="records")` turns each row into a plain
    `{header: value}` dict so the per-row logic below never depends on
    pandas indexing quirks (e.g. a non-default RangeIndex).
    """
    field_to_header = {canonical_field: header for header, canonical_field in mapping.items()}

    rows: list[CleanRow] = []
    rejects: list[RejectedRow] = []

    for row_number, raw_row in enumerate(df.to_dict(orient="records"), start=1):
        outcome = _clean_row(raw_row, field_to_header, exam_year)
        if isinstance(outcome, _RowError):
            rejects.append(
                RejectedRow(row_number=row_number, reason=outcome.reason, column=outcome.column)
            )
        else:
            rows.append(outcome)

    return CleaningResult(rows=rows, rejects=rejects)
