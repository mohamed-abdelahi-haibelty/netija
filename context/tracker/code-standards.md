# Code Standards

## General

- Keep modules small and single-purpose; routes are thin, logic
  lives in `services/`, schemas in `schemas/`.
- Fix root causes; do not layer workarounds on symptoms.
- Do not mix unrelated concerns in one component, route, or job.
- Prefer boring, well-documented solutions over clever ones.
- Every magic value (TTLs, limits, thresholds like the Admis
  cutoff) is a named constant in one place.

## TypeScript

- Strict mode everywhere (`"strict": true`); builds fail on type
  errors.
- No `any`. Use precise types, `unknown` + narrowing at
  boundaries, or Zod-inferred types (`z.infer<typeof schema>`).
- Exam numbers are `string` types in every layer — never `number`
  (leading zeros must be preserved).
- Shared API request/response types live in a single shared
  package/folder imported by both `web/` and `api/`; no
  duplicated hand-written shapes.
- Use discriminated unions for state (e.g. import status:
  `'pending' | 'processing' | 'completed' | 'failed'`), not
  boolean flags.

## Next.js

- Default to Server Components; add `"use client"` only where
  interactivity requires it (tabs, autocomplete input, upload
  form).
- Use the Metadata API for titles/descriptions/Open Graph on all
  public pages; one canonical URL per page.
- Public pages render meaningful content server-side (SSR/ISR) —
  search engines and no-JS users get real HTML.
- Use `next/image` for all images and `next/font` for fonts
  (self-hosted; include an Arabic-capable font, e.g. Noto Sans
  Arabic).
- Student result pages send noindex; the home page and
  informational pages are indexable, included in `sitemap.xml`,
  with `robots.txt` configured accordingly.
- Loading states use route-level `loading.tsx`/Suspense;
  errors use `error.tsx` boundaries (see error-handling.md).
- No blocking third-party scripts; PostHog initializes
  non-blocking after hydration.

## Comments

Comment the **hard parts** — where logic is genuinely difficult (complex
queries, multi-step algorithms, idempotency/conflict handling, or a subtle
domain rule). Simple, self-evident code stays uncommented, even if it uses an
unfamiliar framework feature. The test is **both**: would a reader facing
non-obvious logic have to pause and reverse-engineer _why_ this works? Mere
unfamiliarity with a routine library call is not enough.

Comments explain **why, not what** — assume the reader can read code but doesn't
know the reasoning. Never add a comment that merely restates the code. Keep
comments accurate when code changes — a stale comment is worse than none.

**Comment density varies by area** (see each area note below):

- **Next.js / frontend — minimal.** The maintainer is fluent here. Comment only
  genuinely non-obvious logic or domain rules; never explain routine React/Next
  constructs.
- **Hono (API) — moderate.** Explain non-obvious middleware/route reasoning and
  any domain logic; don't annotate routine handler boilerplate.
- **Drizzle / data & storage — moderate.** Comment non-obvious queries, the
  reasoning behind constraints, and idempotency/conflict handling (why
  `ON CONFLICT` does what it does); skip self-evident queries.
- **Testing (frontend and backend) — moderate.** Comment what a non-obvious test
  is _proving_ and why (especially the tricky edge cases); don't narrate
  routine arrange-act-assert.
- **Python / pandas (worker) — generous.** The maintainer is newest to pandas.
  Briefly explain non-obvious pandas/library constructs (e.g. what
  `dtype=str`, `errors="coerce"`, `.str.strip()` accomplish) in addition to the
  domain reasoning. Still skip trivial lines, but err toward explaining where a
  pandas newcomer would pause.

### Examples

```python
# GOOD (pandas — generous): explains the construct AND the why
# Read every column as text first so leading zeros on exam_no survive and
# dates aren't silently reformatted; we convert each column deliberately below.
# errors="coerce" turns an unparseable cell into NaN instead of crashing the
# whole 50k-row import — the bad row is caught and reported, not fatal.
df = pd.read_excel(path, dtype=str)
df["moyenne"] = pd.to_numeric(df["moyenne"], errors="coerce")
```

## Styling (Tailwind + shadcn/ui)

- Use Tailwind utilities and shadcn/ui components; do not write
  one-off CSS files except for global tokens.
- Colors, radii, and spacing come from the Tailwind theme tokens —
  no hardcoded hex values in components.
- Support RTL: Arabic text is rendered with `dir="rtl"` and
  `lang="ar"` on the element that contains it; French/Latin with
  `lang="fr"`. Use CSS logical properties (ps-/pe-, ms-/me-)
  instead of left/right paddings/margins where direction matters.
- Respect `prefers-reduced-motion` for any animation.

## Accessibility (WCAG 2.1 AA)

- Semantic HTML first: real `<button>`, `<form>`, `<label>`,
  `<nav>`, `<main>`, `<table>` for tabular results.
- Every input has a programmatically associated label; the two
  search tabs are a proper tabs pattern (shadcn Tabs) with
  keyboard support.
- The autocomplete is an accessible combobox: arrow-key
  navigation, Enter to select, Escape to close, and
  `aria-live="polite"` announcements for "N suggestions
  available" / "no results".
- All interactive elements are keyboard reachable with a visible
  focus state; no keyboard traps.
- Color contrast ≥ 4.5:1 for text; decision status (Admis/Ajourné)
  is conveyed by text + icon, never color alone.
- Async states (searching, importing) are announced via
  aria-live regions; document `lang` is set and per-string
  overrides used for mixed AR/FR content.
- Accessibility is verified in tests (see testing.md):
  jest-axe on key pages/components.

## SEO (public pages)

- Unique `<title>` and meta description per public page;
  Open Graph + Twitter card tags on the home page.
- One `<h1>` per page; heading levels never skip.
- `sitemap.xml` and `robots.txt` generated by the app.
- Clean URLs (`/student/[id]`, `/?tab=exam`), canonical tags,
  no duplicate-content routes.
- Core Web Vitals are SEO: keep LCP < 2.5 s, CLS < 0.1
  (reserve space for async content), INP < 200 ms.

## API Routes (Hono)

- Validate and parse all input with `zValidator` before any
  logic runs; handlers read only `c.req.valid(...)`.
- Enforce Better Auth session on every protected route at the
  route level (middleware), before any mutation logic.
- Response shapes are consistent and typed:
  success `{ data: ... }`, error
  `{ error: { code, message } }` (see error-handling.md).
- Use correct status codes: 200 read, 201 created, 202 accepted
  (queued imports), 204 no content, 400/422 validation,
  401 unauthenticated, 404 not found, 429 rate limited.
- Public GET routes set explicit Cache-Control headers;
  authenticated/admin routes set `no-store`.
- Health endpoints: `/health` (liveness, no deps) and
  `/health/ready` (checks Postgres + Redis + Meilisearch).

## Data and Storage

- Postgres is the source of truth; Redis and Meilisearch hold
  only derived, rebuildable data.
- Every DB query goes through Drizzle with typed schema; no raw
  SQL strings in routes (raw SQL allowed only in the Python
  loader and migrations, or in an api/src/services/ function via
  Drizzle's `sql` tag for a query shape the builder can't express
  cleanly — e.g. `meiliIndex.ts#PUBLISHED_ATTEMPTS_SQL`'s joined
  projection with a `bigint::int` cast — provided it's isolated in
  one named, commented function, never inlined in a route).
- All writes that can conflict use upsert/ON CONFLICT consistent
  with the uniqueness invariants (see architecture.md).
- Original uploaded Excel files are kept on the uploads volume;
  never deleted by code.

## Python (worker)

- Type hints on all functions; format with ruff/black defaults.
- Cleaning and mapping functions are pure
  (DataFrame/values in → values out) and unit-tested.
- Read Excel with `dtype=str`, then convert columns deliberately
  (`to_numeric` with `errors="coerce"`); never let pandas guess
  types for exam_no. NNI, birth date, and birth place columns are
  ignored and never stored, even if present in the file.
- Every import produces a summary `{inserted, rejected}` and a
  reject report; silent drops are forbidden.

## File Organization

- `web/app/` — Next.js routes (public pages, /admin).
- `web/components/` — shared components; `web/components/ui/` —
  shadcn-generated (protected, see ai-workflow-rules.md).
- `api/src/routes|services|schemas|db|middleware/` — as named.
- `worker/` — `worker.py` (entry), `cleaning.py`, `mapping.py`,
  `loader.py`, `tests/`.
- `shared/` — API types shared between web and api.
- Tests live next to the suite conventions in testing.md.
