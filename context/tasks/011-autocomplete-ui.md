# 011 — Name Autocomplete (year-labeled results)

**Depends on:** 009, 010
**Context:** code-standards.md (accessibility combobox), project-overview.md.

## Goal
Typo-tolerant name search UI where each matching attempt is a year-labeled row.

## Requirements
- Debounced querying; minimum query length matching the API.
- Renders up to ~10 suggestions, each showing name + exam_year + serie,
  newest year first. A name appearing in several years shows as several rows.
- Full combobox accessibility: arrow-key nav, Enter selects, Escape closes,
  aria-live for result count and empty state.
- Selecting a row navigates to that result page (that attempt).
- French and Arabic input; all chrome strings localized.

## Out of scope
- Search API changes; any person/merge concept.

## Done when
- [ ] Tests: debounce; up to 10 rows; a name with 3 years shows 3 rows labeled
      by year, newest first; keyboard-only operation; announced empty state;
      selection navigates to the right result.
- [ ] jest-axe passes with the listbox open.
