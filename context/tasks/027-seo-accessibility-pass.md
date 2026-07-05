# 027 — SEO & Accessibility Pass

**Depends on:** 010–012, 005
**Context:** code-standards.md (SEO + accessibility sections — this task verifies them globally).

## Goal
A sweep that makes the public site properly indexable, internationally correct, and verifiably accessible.

## Requirements
- Localized metadata (title/description) per public page and locale; Open Graph on the home page; canonical URLs; hreflang alternates between the FR and AR versions.
- sitemap generated with localized URLs for indexable pages only; robots configuration: student result pages noindex (privacy decision per code-standards).
- Heading structure audited (one h1, no skipped levels); semantic landmarks present; document/per-element lang correctness for mixed-script content.
- jest-axe green across home (both tabs, listbox open), student page, login, and the dashboard list — both locales.
- Lighthouse run on the home and student pages documented with results meeting the project targets (Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95 mobile); regressions filed as findings in the tracker rather than silently accepted.

## Out of scope
- Performance optimization work itself (028) beyond what the audit reveals as SEO-blocking.

## Done when
- [ ] Sitemap/robots/hreflang covered by tests; axe suite green; the documented Lighthouse results meet targets or have tracked exceptions.
