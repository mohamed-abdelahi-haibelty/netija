# Fixtures

One small `.xlsx` per historical export format (6–7 fabricated rows each),
plus a synthetic future-minimal file. Column names, order, and per-year
presence/absence of NNI/birth/school columns mirror **real** historical
export headers supplied by the maintainer. **Every row value (names, NNIs,
dates, moyennes, exam numbers) is fully fabricated** — no real student data
appears in any of these files.

These files are frozen samples of real column layouts (protected — see
`ai-workflow-rules.md`; don't edit them, add a new fixture instead). Every
mapping/cleaning change (016/017) must keep all of these importing
correctly.

Canonical fields the pipeline ever stores: `exam_no`, `name_fr`, `name_ar`,
`serie`, `moyenne`, `decision` (+ `decision_raw`). Everything else — NNI,
birth date, birth place (FR/AR), wilaya, exam center, candidate's school,
registration number, candidature type — is recognized but **ignored**:
never mapped, never written to the database.

| File | Exam no. col | Name col(s) | Serie | Moyenne | Decision | Ignored columns present | Traps |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `2024.xlsx` | `NODOSS` | `NOMPL` (FR), `NOMPA` (AR) | `SERIE` | `MOYBAC` | `Decision` | `NNI`, `LIEUN`/`LIEUNA` (birth place FR/AR), `DATN` (birth date), `WILAYA_FR`/`WILAYA_AR`, `Libnoets`/`Libnoetce` (school/center labels) + their `...AR` counterparts | Apostrophe in name (`Sid'Ahmed`); decisions `Admis`, `Ajourné`, `Abscent`, `Sessionnaire` |
| `2023.xlsx` | `NODOSS` | `NOMPL` (FR), `NOMPA` (AR) | `SERIE` | `MOYBAC` | `Decision` | same as 2024 (identical export format) | decisions incl. `Ajourné(e)`, `Délibérable` |
| `2022.xlsx` | `Num Bac` (leading zeros) | `Nom` (FR), `Nom Ar` (AR) | `SERIE` | `Moy Bac` | `decision` (lowercase header) | `Lieu Naiss`/`Date Naiss` (birth place/date) present, but **no NNI column at all** | Contrast with `2021.xlsx` (has NNI, this one doesn't); real-file SERIE typos `SNE`/`ME`/`LME` alongside valid values — SERIE is stored verbatim, never validated against an enum; extra ignored columns `Type Candidature`, `Motif`, `Noreg`, `Wilaya`/`Wilaya Ar`, `Centre`/`Centre Ar`, `Etablissement`/`Etablissement AR` |
| `2021.xlsx` | `Numéro Bac` (leading zeros) | `Nom` (FR), `Nom Arabe` (AR) | `SERIE` | `MoyBac` | `Decision` | `NNI`, `Lieu Naiss`/`Lieu Arabe`, `Date Naiss`, plus ignored `NOREG`, `Code`, `Centre`, `Ecole` | Has an NNI column — the counterpart to 2022 having none |
| `2020.xlsx` | `Numero Bac` (leading zeros) | `Nom` (FR only) | `SERIE` | `Moyenne Bac` | `Decision` | `NNI` | Raw SERIE casing is inconsistent (`sn`, `Lo` alongside `LM`/`TM`/`M`) — cleaning normalizes this, fixture intentionally doesn't; `Abscent` and `Examen annulé CT (Usage du Téléphone)` rows both carry a blank moyenne |
| `2019.xlsx` | `Numéro Bac` | `Nom` (FR only) | `SERIE` | `Moyenne` | `Decision` | `Date Naissance`/`Lieu Naissance` present, **no NNI** | `Ajourné Sn` and `Admis Sn` decision variants; extra ignored `Code Wilaya`, `Wilaya`, `Centre` |
| `2018.xlsx` | `NODOSS` | `NOMPL` (FR only) | `SERIE` | `MOYG1` | `Decision` | `DATN`, `LIEUN`, plus ignored `TYPEC`, `Libecole`, `Libcentre`, `Noreg`, `Wilaya` | `Ajourné(e)` and `Sessionaire` (typo) decisions; `NODOSS` naturally includes a leading zero (`05321` range) |
| `2017.xlsx` | `NODOSS` | `NOMPL` (FR only) | `SERIE` | `Moyg1` (lowercase `g`) | `Décision` (accented header) | `DATN`, `LIEUN`, plus ignored `TYPEC`, `NOREG`, `LETAB` | `Admis Sn`, `Delibérable Sn`, `Ajourné Sn` decisions; decision header spelling varies (`Décision` here vs. `Decision`/`decision` elsewhere) |
| `2015.xlsx` | `NODOSS` | `NOMPL` (FR only) | `SERIE` | `MOYG1` | `decision` (lowercase header) | `DATN`, `LIEUN`, plus ignored `LETAB` | `Ajourné(e)` alongside plain `Ajourné`/`Admis` |
| `future_minimal.xlsx` | `N° Bac` (leading zeros) | `Nom Complet` (FR only) | *(absent)* | *(absent)* | *(absent)* | none | The guaranteed floor only: exam number + one name column. No serie/moyenne/decision at all — every row is expected to be rejected downstream for missing required fields, but the file itself must still open and map without crashing |

## Column-name variety this set exercises

- Exam-number header spelling varies year to year: `NODOSS`, `Num Bac`,
  `Numéro Bac` (2019/2021, with accent), `Numero Bac` (2020, no accent),
  `N° Bac`.
- Moyenne header spelling varies: `MOYBAC`, `Moy Bac`, `MoyBac`,
  `Moyenne Bac`, `Moyenne`, `MOYG1`, `Moyg1`.
- Decision header spelling/casing varies: `Decision`, `decision` (2022,
  2015), `Décision` (2017, accented).
- Arabic name header varies: `NOMPA` (2024/2023), `Nom Ar` (2022),
  `Nom Arabe` (2021).
- Birth place/date presence is genuinely per-file, not a clean
  "old years have it, new years don't" split: 2022 and 2019 both have
  birth place/date but **no NNI**; 2021 and 2020 have NNI; 2017/2018/2015
  have birth place/date but no NNI either. The pipeline must detect field
  availability per file, never assume it from the year.

## Why headers are faithful even for ignored columns

The pipeline's job is to recognize NNI/birth-date/birth-place/school/
wilaya columns and drop them — it can only prove that by having fixtures
that actually contain them under their real header names, in their real
positions.

## Decision variants learned from real files, not yet in a fixture

No 2025 fixture exists here (would require real student data, which these
files never contain — see the top of this doc). Found 2026-07-04 against a
real `bac_2025` file uploaded through the admin: `NOM_FR`/`NOM_AR` (both FR
and AR name columns, `NODOSS`/`Moy Bac`/`Decision`), and three previously
unrecognized decision variants (all rejected the whole row until fixed):
`Admis(e)` and `Absent(e)` (the same gendered-suffix pattern `Ajourné(e)`
already covers, just never extended to these two — see
`cleaning.DECISION_ALIASES`), and `Annulation de l'examen` (a reversed
phrasing of the existing `Examen annulé CT (...)` prefix match, seen with a
curly apostrophe in the real file — `cleaning._fold` now normalizes curly
to straight apostrophes).
