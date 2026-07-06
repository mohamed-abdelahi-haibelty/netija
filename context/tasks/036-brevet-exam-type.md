# Task 036 — Second exam type: Brevet (BEPC) alongside Bac

## Goal

Add a second exam type, the Brevet (BEPC — "Examen du Brevet" /
مسابقة ختم دروس الإعدادية), alongside the existing Baccalauréat (Bac).
Brevet has the same years (2015–2025) and the same functionality as Bac,
with ONE difference: **Brevet has no serie (track)**. We care about the
same fields: name, exam number, exam year, decision, moyenne.

## Approach

A single unified model with an `exam_type` discriminator
(`'bac' | 'brevet'`) — NOT duplicated tables or code. Brevet reuses the
existing pipeline, search, and pages; it is distinguished by an
`exam_type` column, and `serie` becomes optional (present for Bac, absent
for Brevet).

## Requirements

- **Schema**: `exam_type` on `attempts` (NOT NULL) and `imports` (nullable
  until confirm). Uniqueness `UNIQUE(exam_type, exam_year, exam_no)`.
  `serie` nullable; "required for bac, absent/ignored for brevet" enforced
  in cleaning validation, not as a hard NOT NULL. `public_slug` unchanged
  (globally unique → resolves to exactly one typed row). Dev-only:
  regenerate a single clean migration (not an incremental backfill), keep
  the journal-monotonicity guard.
- **Pipeline**: for Brevet, serie is not required and any serie column is
  ignored; for Bac, serie stays required. Field availability still
  detected per file, never hardcoded.
- **Search**: exam-number and name search scoped by exam type; Redis keys
  and Meili documents/filter namespaced by exam_type so Bac and Brevet
  never collide. Result/slug lookup returns the correct typed result.
- **Result page**: shows serie only for Bac; omits it entirely for Brevet.
- **Admin**: upload/preview/import/publish/delete works for both types; the
  admin picks the exam type when confirming an upload; the dashboard shows
  each import's type.
- **Home page**: the visitor chooses Bac or Brevet (a selector carried in
  the URL as `?type=`), and the whole search operates within that type.
  i18next keys for all new strings (FR "Brevet (BEPC)", AR
  "مسابقة ختم دروس الإعدادية").
- **Analytics**: existing events gain an `exam_type` property
  (`bac | brevet`), non-personal.

## Done when

- Both types import and search independently; a Bac and a Brevet sharing
  year+exam_no don't collide; type-scoped search returns only the chosen
  type; Brevet result pages omit serie entirely.
- Context files (architecture, project-overview, testing) describe the
  two-exam-type model.
- All suites (vitest / jest / pytest), typecheck, lint, and build green.
