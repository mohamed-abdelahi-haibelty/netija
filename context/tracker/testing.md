# Testing Conventions

## Philosophy

Tests are how AI-written code is verified. Every unit of work
ships with tests proving its behavior, including failure paths.
Follow the testing pyramid: many fast unit tests, a focused set
of integration tests, very few end-to-end checks (staging
verification covers true E2E). Don't chase coverage numbers;
cover behavior that matters — and in this project the riskiest
logic is identity resolution, column mapping, decision
normalization, and date parsing.

## Tooling by Layer

| Layer            | Runner                       | Style |
| ---------------- | ---------------------------- | ----- |
| api/ (Hono)      | Vitest                       | Unit (services, schemas) + integration via `app.request()` |
| web/ (Next.js)   | Jest + React Testing Library | Component behavior + accessibility (jest-axe) |
| worker/ (Python) | pytest                       | Pure-function unit tests on cleaning/mapping/identity; loader tests against a disposable Postgres |

Test files: `*.test.ts` colocated in `__tests__/` or `tests/`
per package; Python tests in `worker/tests/`.

## Universal Rules

- Arrange–Act–Assert structure; one behavior per test; name tests
  as behavior statements ("rejects an exam number with letters").
- Tests are isolated: fresh state in `beforeEach`; no test depends
  on another's side effects; no shared mutable fixtures.
- Mock the edges (Redis, Meilisearch, BullMQ, Sentry, PostHog,
  spawned Python), test the core for real. Never mock the
  function under test. When in doubt, mock less.
- No real network calls in unit/integration tests. Sentry/PostHog
  are no-op'd via missing env keys or `vi.mock`.
- Deterministic: control time with fake timers when logic depends
  on it; no sleeps; no reliance on wall-clock or randomness
  (seed or inject).

## Hono API Testing

Use `app.request()` against the exported app (the app/server
split exists precisely for this). The typed `testClient` from
`hono/testing` may be used where route types are complete.

```ts
import app from '../src/app'

it('returns 200 and the student payload', async () => {
  const res = await app.request('/api/students/123')
  expect(res.status).toBe(200)
  expect(await res.json()).toMatchObject({ data: { id: '123' } })
})

it('rejects a malformed exam number with 400', async () => {
  const res = await app.request('/api/search/exam?no=12AB&year=2024')
  expect(res.status).toBe(400)
})
```

Required tests for EVERY route:

1. Happy path — correct status + response shape (`{ data }`).
2. Validation failure — malformed input → 400/422 with the
   standard error shape (never a handler crash).
3. Not found — unknown id/exam number → 404.
4. Auth (protected routes) — no session → 401; non-admin → 403.
5. Side effects — e.g. confirm-import enqueues exactly one BullMQ
   job with the right payload (assert on the mocked queue).
6. Rate limiting (where applied) — exceeding the limit → 429
   with Retry-After (drive the mocked Redis counter).

Domain-specific cases that must exist:

- Same exam number, different years → different students
  (uniqueness is per (year, exam_no)).
- Exam-number search without a year → validation error.
- Cached vs uncached lookup: second call served from mocked
  Redis without hitting the DB layer (assert call counts).

## Upload & Import Pipeline Scenarios (API)

The full admin pipeline must be covered by integration tests
(BullMQ, the spawned Python process, and Redis mocked at the
boundary):

Upload (`POST /api/imports`):

- No session → 401; valid session + valid .xlsx → 201 with
  fileId; the file lands in the uploads volume.
- No file in the form → 400 `VALIDATION_ERROR`.
- Wrong type (.csv, .pdf, renamed .exe) → 415
  `UNSUPPORTED_FILE_TYPE` (checked by content sniffing, not just
  extension).
- Over 25 MB → 413 `FILE_TOO_LARGE`.
- Two files in one request → 400.

Mapping preview (`GET /api/imports/:id/preview`):

- Headers from every historical fixture auto-map their known
  columns; each unknown header appears in `unrecognized`.
- A file missing the guaranteed floor (no exam-number column, or
  no name column at all) → preview flags `missingRequired` and
  confirm is rejected with 422 `MISSING_REQUIRED_COLUMNS`.
- Preview reads only headers + sample rows (assert the full file
  is not parsed at preview time).

Confirm (`POST /api/imports/:id/confirm`):

- Valid mapping + examYear → 202, exactly ONE BullMQ job enqueued
  with `{fileId, mapping, examYear}` (assert on the mocked
  queue); duplicate confirm of the same import does not enqueue
  a second job.
- Malformed mapping payload or out-of-range year → 400; unknown
  import id → 404 `IMPORT_NOT_FOUND`.
- A confirmed manual remap is persisted to column_aliases
  (next preview of the same headers auto-maps it).

Status & publish:

- Status endpoint reflects state transitions
  (waiting → active → completed/failed) and exposes the summary
  `{inserted, rejected, newPeople}` plus the smoke result.
- While unpublished: public search and student APIs exclude the
  new year entirely; admin-preview endpoints include it.
- Publish before smoke passes → 409/422 (blocked); after smoke
  passes → 200, the year becomes publicly visible, and the
  cache purge hook fires (assert on the mocked purge).
- Unpublish reverts visibility (reversibility test).

Suggestions (`/api/suggestions`):

- Pending suggestion appears in the queue and powers the public
  "other records with this name" payload on both persons' pages.
- Accept → links repointed to one person, the empty person
  removed, both pages now serve the merged record, suggestion
  marked accepted.
- Reject → suggestion dismissed, see-also payload disappears.
- All suggestion routes require an admin session (401 otherwise);
  accept/reject are idempotent.

## Frontend Testing (Jest + RTL)

- Query by role/label/text (`getByRole`, `getByLabelText`) —
  never by class or test-id unless unavoidable. If RTL can't
  find it by role, a real user probably can't either.
- Simulate users with `@testing-library/user-event` (typing in
  the autocomplete, keyboard navigation, tab switching).
- Mock `fetch`/API module at the boundary; never mock React
  internals.
- Required component tests:
  - Tabs: switching between name/exam search; exam tab shows the
    year select defaulting to the latest year; name tab has none.
  - Autocomplete: debounced query, renders up to 10 suggestions,
    keyboard navigation (arrows + Enter), empty state announced
    via aria-live, selection navigates to the student page.
    Suggestions render their disambiguators (year, SERIE, birth
    place when available); two persons with identical names are
    visually distinguishable, sorted most-recent-first.
  - Student page: renders decision, moyenne (out of 20), attempt
    count; clicking an attempt reveals that year's result;
    optional fields (school, wilaya) render only when present;
    Arabic name renders with dir="rtl"; the "Other records with
    this name" section renders only when pending suggestions
    exist, uses the neutral "with this name" phrasing, and links
    to the other person's page.
  - Admin upload: file selection, mapping preview table renders
    detected/unrecognized columns, remap dropdown updates the
    payload sent on confirm.
- Accessibility: run jest-axe on the home page, student page, and
  admin upload — zero violations is the bar.

## Python Worker Testing (pytest)

The riskiest code in the project. Pure functions, exhaustively:

- `normalize_name`: case, accents, word order, extra whitespace,
  apostrophes ("Sid'Ahmed"), and Arabic strings pass through
  consistently.
- Identity/linking (attempt-first model): two attempts with the
  same NNI link to one person (Pass 1); a pre-2020 attempt's
  match_key (name + birth_date + birth_place) links it onto a
  person already linked via NNI (the bridge case); same name +
  same placeholder date (31/12) but different birth places →
  two different people; a 2019↔2020 pair sharing only a name →
  a link_suggestion, never an auto-link; every unmatched attempt
  still gets its own person; deleting a person_link cleanly
  unmerges; a full relink rebuild reproduces identical links
  (determinism); an entire file with no NNI and no birth data
  (the guaranteed floor: exam number + name only) imports and
  links without errors — Pass 1/2 simply find nothing and Pass 3
  covers everyone. No code path may assume a year implies a
  field (2022 has no NNI; 2021 and 2023 do).
- Decision normalization: every observed variant maps correctly —
  `Ajourné`, `Ajourné(e)`, `Ajourné Sn`, `Sessionnaire`,
  `Sessionaire`, `Abscent`, `Admis`, `Admis Sn`, `Delibérable`,
  `Examen annulé CT (Usage du Téléphone)` — and unknown variants
  are flagged, not silently passed.
- Date parsing: day-first (`06/02/02`), month-first
  (`6/20/1995`), `5-Mar-02` — each via its per-year config;
  ambiguous values without config → reject, not guess.
- Column mapping: every historical header set (see fixtures)
  auto-maps its known columns; unknown headers are reported as
  unrecognized; required-field absence is reported.
- Loader (against disposable Postgres): inserting the same file
  twice yields identical counts (idempotency); a returning
  student (same NNI, new year) gains an attempt, not a duplicate
  person.

## Fixtures (mandatory)

`worker/tests/fixtures/` contains one small Excel/CSV per real
historical format, with 5–10 rows each, faithful to the actual
headers:

- 2024/2023: NNI, NODOSS, SERIE, NOMPL, LIEUN, DATN, NOMPA,
  MOYBAC, Decision, WILAYA_FR/AR, Libnoets…
- 2022: Num Bac, Nom, Date Naiss, Nom Ar, Type Candidature,
  SERIE, Moy Bac, decision…
- 2021: NOREG, Centre, NNI, Numéro Bac, SERIE, Nom Arabe, Nom,
  MoyBac, Decision, Date Naiss…
- 2020: NNI, Numero Bac, Nom, SERIE, Moyenne Bac, Decision
  (includes `Abscent` and `Examen annulé` rows).
- 2019: month-name dates (`5-Mar-02`), `Ajourné Sn` decisions.
- 2018/2017/2015: NODOSS, NOMPL, DATN (month-first in 2018),
  MOYG1, Decision variants (`Ajourné(e)`, `Sessionaire`).
- future-minimal (synthetic): ONLY an exam number column and one
  name column — the guaranteed floor. Must import successfully,
  every row gets a person (Pass 3 only), pages render, and
  cross-year linking produces suggestions at most, never errors.

Every mapping/cleaning change must keep all fixture imports
passing. New real-world variants get added as fixtures first
(red), then handled (green).

## Results-Day Smoke Verification

The repo contains a smoke-verification script that, given an
import id, samples ≥ 20 random imported attempts and asserts the
admin-preview API/pages return the matching exam_no, name,
moyenne, and decision, and reconciles totals (file rows =
inserted + rejected). It runs automatically after every import;
its pass/fail is shown on the dashboard, and publishing is
blocked until it passes (architecture.md invariant 12). The
script itself is covered by tests using a seeded fixture import,
including one deliberate mismatch case proving it fails loudly.

The full results-day pipeline (upload → unpublished import →
smoke pass → publish) is rehearsed on staging with last year's
file before every results day; the rehearsal is part of the
release checklist, not optional.

## CI Gate

A unit is not done until: `vitest run` (api), `jest` (web), and
`pytest` (worker, when touched) all pass locally and in CI,
alongside build/typecheck/lint. Deployment to staging requires a
green CI; production import requires staging verification
(project-overview.md release flow).
