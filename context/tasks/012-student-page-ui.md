# 012 — Student Page

**Depends on:** 008
**Context:** project-overview.md (public flow steps 5–6), code-standards.md (i18n data-vs-chrome rules, RTL), testing.md (student page tests).

## Goal
The page where a visitor sees a student's result and full attempt history.

## Requirements
- Displays: name (FR and/or AR with per-element lang/dir), latest decision conveyed by text + icon (never color alone), Moyenne Générale out of 20, serie, and the attempt count.
- Attempts listed newest first; activating an attempt reveals that year's details (year, exam number, moyenne, decision); optional fields render only when present.
- Decision display labels are localized off the normalized enum; stored data values render as stored.
- "Other records with this name" section renders only when the API provides see-also entries, uses the neutral phrasing, and links to the other pages.
- Honest loading and error states per error-handling.md frontend rules.

## Out of scope
- Admin/unpublished preview rendering (022).

## Done when
- [ ] All student-page tests from testing.md pass, including the conditional see-also and RTL name rendering.
- [ ] The seeded redemption-arc person shows both attempts with correct ordering and details in both locales.
- [ ] jest-axe passes.
