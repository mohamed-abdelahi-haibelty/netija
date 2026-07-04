# 012 — Result Page UI

**Depends on:** 008
**Context:** project-overview.md (result page), code-standards.md (i18n, RTL, a11y).

## Goal
The page a visitor sees for a single result.

## Requirements
- Displays: name (fr/ar with correct lang/dir), exam_year, serie, decision
  (text + icon, never color alone), moyenne out of 20. Optional school/wilaya
  only if still stored.
- No multi-attempt history, no "other records with this name", no see-also.
- All strings via i18next keys (fr + ar); correct RTL for Arabic.
- Honest loading / not-found / error states per error-handling.md.

## Out of scope
- Any person/linking concept.

## Done when
- [ ] Tests: renders decision, moyenne, serie, year; not-found state; Arabic
      name renders dir="rtl".
- [ ] jest-axe passes in both locales.
