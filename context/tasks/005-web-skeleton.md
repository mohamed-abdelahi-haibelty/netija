# 005 — Next.js Skeleton with i18n

**Depends on:** 001
**Context:** code-standards.md (Next.js, Internationalization, Accessibility sections), project-overview.md (goal 5).

## Goal
A running Next.js app with TypeScript, Tailwind, shadcn/ui, full FR/AR internationalization via i18next, and the testing setup — the shell every UI task fills in.

## Requirements
- Next.js App Router + TypeScript strict + Tailwind + shadcn/ui initialized.
- i18next configured with French and Arabic locales and locale-aware routing; Arabic is the default locale. Document `lang` and `dir` follow the active locale (Arabic renders RTL site-wide).
- A language switcher present in the layout that preserves the current page when switching.
- Translation file structure established; a demonstration string rendered from keys in both locales; CI-level check that locale files have matching keys.
- Fonts set up for Latin and Arabic scripts.
- Route-level error boundaries and a global error boundary per error-handling.md (frontend rules).
- Typed API client utility consuming types from `shared/`.
- Jest + React Testing Library + jest-axe configured.

## Out of scope
- Any real pages/features; PostHog/Sentry (026); visual design decisions (owned by the design skill).

## Done when
- [ ] Both locales render; switching flips lang/dir correctly and stays on the same page.
- [ ] jest-axe passes on the shell layout in both locales.
- [ ] The locale-key parity check fails the build when a key is missing in one locale (proven by a temporary test).
