# 011 — Name Autocomplete

**Depends on:** 009, 010
**Context:** testing.md (autocomplete test list), code-standards.md (accessibility — combobox requirements), project-overview.md (disambiguation).

## Goal
The typo-tolerant name search experience: an accessible combobox wired to the name-search API.

## Requirements
- Debounced querying (no request per keystroke); minimum query length matching the API.
- Renders up to 10 suggestions, each showing the name plus its disambiguators (year, serie, birth place when available), most-recent-first — two identical names must be visually distinguishable.
- Full combobox accessibility: arrow-key navigation, Enter selects, Escape closes, aria-live announcements for result count and the empty state.
- Selecting a suggestion navigates to that person's student page.
- Works with Arabic and French input; all chrome strings localized.

## Out of scope
- Search API changes; styling decisions.

## Done when
- [ ] All autocomplete tests from testing.md pass, including keyboard-only operation and the announced empty state.
- [ ] A test renders two identical-name suggestions and asserts they are distinguishable by their disambiguators.
- [ ] jest-axe passes with the listbox open.
