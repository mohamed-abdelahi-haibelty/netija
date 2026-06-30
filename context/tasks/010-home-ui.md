# 010 — Home Page: Two Search Tabs

**Depends on:** 005, 007
**Context:** project-overview.md (public flow steps 1–2), code-standards.md (accessibility, i18n).

## Goal
The public landing page: the two-tab search experience with the exam-number flow working end to end.

## Requirements
- Two tabs — search by name, search by exam number — implemented as an accessible tabs pattern with keyboard support.
- Exam tab: exam-number field plus a year selector populated from the published-years endpoint, defaulting to the latest; submitting navigates to the student page on success; a not-found state explains the failure and shows the searched year; validation errors surface as accessible field messages.
- Name tab: hosts the autocomplete (a placeholder slot until task 011).
- All strings via i18next keys in both locales; correct behavior in RTL.

## Out of scope
- The autocomplete component itself (011); visual design decisions (design skill).

## Done when
- [ ] Tests: tab switching (mouse + keyboard); year select defaults to latest; successful search navigates; not-found state renders with the year; malformed input shows a field-level message.
- [ ] jest-axe passes in both locales.
