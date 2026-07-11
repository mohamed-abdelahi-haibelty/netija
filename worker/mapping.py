"""Column mapping: recognize a raw Excel header row and map it to the
minimal canonical fields the pipeline ever stores.

Canonical fields are ONLY: exam_no, name_fr, name_ar, serie, moyenne,
decision. There is deliberately no nni/birth_date/birth_place mapping —
this project never stores those, even when a file has them.

Pure functions only (no pandas, no I/O, no Postgres): this module's job is
to turn a list of header strings into a mapping decision. Reading Excel
files lives in the eventual loader (020); learned aliases are fetched from
the `column_aliases` table by the API/worker glue code and passed in here
as a plain dict, so this module stays framework- and DB-free per
code-standards.md's "pure DataFrame/values in -> values out" rule.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass, field
from typing import Literal

# A file is only guaranteed to have an exam number and at least one name
# column (architecture.md's "never trust the file's schema" invariant).
# serie/moyenne/decision may be absent in older files without failing the
# floor check — a row missing them is rejected later, at cleaning (017),
# not here.
NAME_FIELDS = ("name_fr", "name_ar")

ColumnStatus = Literal["mapped", "ignored", "unrecognized"]


def normalize_header(header: str) -> str:
    """Collapse a raw header into a lookup key so headers that differ only
    by accents, case, or punctuation (e.g. "Numéro Bac" vs "Numero Bac",
    "N° Bac" vs "N Bac") resolve to the same alias entry.

    NFKD decomposition splits an accented letter like 'é' into 'e' plus a
    separate combining accent mark; dropping characters classified as
    "combining" strips the accent while keeping the base letter. Anything
    that isn't a letter or digit (spaces, underscores, the '°' sign,
    apostrophes) becomes a space, then repeated whitespace collapses to one
    space, so "WILAYA_FR" and "Wilaya Ar"-style headers normalize the same
    way punctuation-for-punctuation.
    """
    decomposed = unicodedata.normalize("NFKD", header)
    without_accents = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    alnum_or_space = "".join(ch if ch.isalnum() else " " for ch in without_accents)
    return " ".join(alnum_or_space.lower().split())


# Built-in dictionary of every real historical header (see
# worker/tests/fixtures/README.md) that maps to a canonical field, keyed by
# its normalized form. New years extend this dictionary; they never require
# touching the analysis logic below.
BUILTIN_CANONICAL_ALIASES: dict[str, str] = {
    # exam_no
    "nodoss": "exam_no",
    "num bac": "exam_no",
    "numero bac": "exam_no",  # covers "Numéro Bac" and "Numero Bac" alike
    "n bac": "exam_no",  # "N° Bac" once the degree sign is stripped
    # name_fr
    "nompl": "name_fr",
    "nom": "name_fr",
    "nom complet": "name_fr",
    "nom fr": "name_fr",
    # name_ar
    "nompa": "name_ar",
    "nom ar": "name_ar",
    "nom arabe": "name_ar",
    # serie
    "serie": "serie",
    # moyenne
    "moybac": "moyenne",
    "moy bac": "moyenne",
    "moyenne bac": "moyenne",
    "moyenne": "moyenne",
    "moyg1": "moyenne",
    # decision (accented "Décision" and lowercase "decision" both normalize
    # to "decision", so a single key covers every historical spelling)
    "decision": "decision",
}

# Headers that are recognized on sight but deliberately never stored: NNI,
# birth date/place (FR/AR), wilaya, school/exam-center labels, registration
# numbers, and candidature metadata. Reporting these separately from truly
# unrecognized headers is what lets the mapping preview say "ignored", not
# "unknown", for a column the pipeline understands but refuses to keep.
IGNORED_HEADER_ALIASES: dict[str, str] = {
    "nni": "nni",
    "datn": "birth_date",
    "date naiss": "birth_date",
    "date naissance": "birth_date",
    "lieun": "birth_place",
    "lieuna": "birth_place",
    "lieu naiss": "birth_place",
    "lieu naissance": "birth_place",
    "lieu ar": "birth_place",
    "lieu arabe": "birth_place",
    "wilaya": "wilaya",
    "wilaya fr": "wilaya",
    "wilaya ar": "wilaya",
    "code wilaya": "wilaya",
    "libnoets": "school",
    "libnoetsar": "school",
    "etablissement": "school",
    "etablissement ar": "school",
    "libecole": "school",
    "ecole": "school",
    "letab": "school",
    "libnoetce": "exam_center",
    "libnoetcear": "exam_center",
    "centre": "exam_center",
    "centre ar": "exam_center",
    "libcentre": "exam_center",
    "noreg": "registration_no",
    "code": "registration_no",
    "type candidature": "candidature_type",
    "typec": "candidature_type",
    "motif": "rejection_reason",
}


# Categories architecture.md explicitly bans from ever being written to the
# database ("The project never stores NNI, birth date, or birth place at
# all"; school/wilaya join that same never-stored group per the 013b
# resolved ambiguity in progress-tracker.md). NOT included here:
# exam_center/registration_no/candidature_type/rejection_reason — ignored
# for scope reasons, not named as a privacy invariant, so they're allowed to
# stay in a reject's raw audit copy.
_PII_BANNED_CATEGORIES = frozenset({"nni", "birth_date", "birth_place", "school", "wilaya"})


def banned_pii_headers(headers: list[str]) -> set[str]:
    """Headers whose normalized form falls into a category architecture.md
    bans from ever being stored. Used to redact the raw-row copy kept
    alongside a rejected row for the admin audit trail (worker/loader.py) —
    that copy must never carry NNI/birth date/birth place/school/wilaya any
    more than a successfully inserted attempt does.
    """
    return {
        header
        for header in headers
        if IGNORED_HEADER_ALIASES.get(normalize_header(header)) in _PII_BANNED_CATEGORIES
    }


def missing_required_fields(mapped_fields: set[str]) -> list[str]:
    """The guaranteed-floor check shared by `analyze_headers` (preview time)
    and `loader.check_mapping_floor` (load time, the last line of defense):
    a mapping only ever needs exam_no and at least one of NAME_FIELDS.
    """
    missing: list[str] = []
    if "exam_no" not in mapped_fields:
        missing.append("exam_no")
    if not mapped_fields.intersection(NAME_FIELDS):
        missing.append("name")
    return missing


def build_alias_dictionary(learned_aliases: dict[str, str] | None = None) -> dict[str, str]:
    """Merge the built-in canonical-header dictionary with learned aliases
    from the `column_aliases` table. Learned aliases win on conflict — an
    admin's manual remap of a header always overrides the built-in guess.
    """
    merged = dict(BUILTIN_CANONICAL_ALIASES)
    if learned_aliases:
        for raw_header, canonical_field in learned_aliases.items():
            merged[normalize_header(raw_header)] = canonical_field
    return merged


@dataclass(frozen=True)
class ColumnMapping:
    header: str
    canonical_field: str | None
    status: ColumnStatus
    ignored_category: str | None = None


@dataclass(frozen=True)
class MappingAnalysis:
    columns: list[ColumnMapping] = field(default_factory=list)
    mapping: dict[str, str] = field(default_factory=dict)  # header -> canonical field
    ignored: list[str] = field(default_factory=list)  # recognized-but-unused headers
    unrecognized: list[str] = field(default_factory=list)  # headers nothing recognizes
    missing_required: list[str] = field(default_factory=list)  # floor violations

    @property
    def passes_floor(self) -> bool:
        return not self.missing_required


def analyze_headers(
    headers: list[str],
    learned_aliases: dict[str, str] | None = None,
) -> MappingAnalysis:
    """Propose a canonical mapping for a file's raw header row.

    Field availability is derived purely from which canonical fields end up
    mapped here — never from the exam year — per architecture.md's
    never-trust-the-file invariant.
    """
    alias_dictionary = build_alias_dictionary(learned_aliases)

    columns: list[ColumnMapping] = []
    mapping: dict[str, str] = {}
    ignored: list[str] = []
    unrecognized: list[str] = []

    for header in headers:
        key = normalize_header(header)

        if key in alias_dictionary:
            canonical_field = alias_dictionary[key]
            columns.append(ColumnMapping(header, canonical_field, "mapped"))
            mapping[header] = canonical_field
        elif key in IGNORED_HEADER_ALIASES:
            category = IGNORED_HEADER_ALIASES[key]
            columns.append(ColumnMapping(header, None, "ignored", category))
            ignored.append(header)
        else:
            columns.append(ColumnMapping(header, None, "unrecognized"))
            unrecognized.append(header)

    mapped_fields = set(mapping.values())
    missing_required = missing_required_fields(mapped_fields)

    return MappingAnalysis(
        columns=columns,
        mapping=mapping,
        ignored=ignored,
        unrecognized=unrecognized,
        missing_required=missing_required,
    )
