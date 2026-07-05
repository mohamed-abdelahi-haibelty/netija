# Testing Conventions

## Philosophy

Tests are how AI-written code is verified. Every unit of work
ships with tests proving its behavior, including failure paths.
Follow the testing pyramid: many fast unit tests, a focused set
of integration tests, very few end-to-end checks (the production,
unpublished rehearsal covers true E2E). Don't chase coverage numbers;
cover behavior that matters — and in this project the riskiest
logic is column mapping, decision normalization, and the
importable-vs-rejected split.

## Tooling by Layer

| Layer            | Runner                       | Style |
| ---------------- | ---------------------------- | ----- |
| api/ (Hono)      | Vitest                       | Unit (services, schemas) + integration via `app.request()` |
| web/ (Next.js)   | Jest + React Testing Library | Component behavior + accessibility (jest-axe) |
| worker/ (Python) | pytest                       | Pure-function unit tests on cleaning/mapping; loader tests against a disposable Postgres |

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

it('returns 200 and the result payload', async () => {
  const res = await app.request('/api/results/2024/00573')
  expect(res.status).toBe(200)
  expect(await res.json()).toMatchObject({ data: { examNo: '00573' } })
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

- Same exam number, different years → different results
  (uniqueness is per (year, exam_no)).
- Exam-number search without a year → validation error.
- Cached vs uncached lookup: second call served from mocked
  Redis without hitting the DB layer (assert call counts).
- Unpublished year: public search and result endpoints exclude it;
  admin-preview endpoints include it.

## Name Search Tests

- The index builder produces one document PER PUBLISHED ATTEMPT
  (not per person). A name appearing in three published years
  yields three documents.
- The search endpoint returns matching attempts, up to ~10, newest
  year first, each carrying its year and serie; validates a
  minimum query length; supports French and Arabic input.
- Unpublished years are never indexed / never returned.

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
- NNI / birth-date / birth-place columns present in a file are
  reported as recognized-but-ignored (they are never stored).
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
  `{inserted, rejected}` plus the smoke result.
- While unpublished: public search and result APIs exclude the
  new year entirely; admin-preview endpoints include it.
- Publish before smoke passes → 409/422 (blocked); after smoke
  passes → 200, the year becomes publicly visible, and the
  cache purge hook fires (assert on the mocked purge).
- Unpublish reverts visibility (reversibility test).

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
  - Autocomplete: debounced query, renders up to 10 results,
    keyboard navigation (arrows + Enter), empty state announced
    via aria-live, selection navigates to the result page. Each
    row shows its year + serie; a name appearing in three years
    shows three separate rows, newest first.
  - Result page: renders decision, moyenne (out of 20), serie,
    year; not-found state; Arabic name renders with dir="rtl".
    There is no multi-attempt history and no "other records"
    section.
  - Admin upload: file selection, mapping preview table renders
    detected/unrecognized columns, remap dropdown updates the
    payload sent on confirm.
- Accessibility: run jest-axe on the home page, result page, and
  admin upload — zero violations is the bar.

## Python Worker Testing (pytest)

The riskiest code in the project. Pure functions, exhaustively:

- `normalize_name`: case, accents, extra whitespace, apostrophes
  ("Sid'Ahmed"), and Arabic strings pass through consistently.
- Decision normalization: every observed variant maps correctly —
  `Ajourné`, `Ajourné(e)`, `Ajourné Sn`, `Sessionnaire`,
  `Sessionaire`, `Abscent`, `Admis`, `Admis Sn`, `Delibérable`,
  `Examen annulé CT (Usage du Téléphone)` — and unknown variants
  are flagged, not silently passed.
- Leading zeros on exam_no are preserved (read as text, never
  numeric); exam_no is validated as a digit string within a sane
  length bound (not a hardcoded exact length).
- Ignored columns: if a fixture contains NNI / birth date / birth
  place, the cleaning step drops them and they never reach the
  loaded row.
- Importable-vs-rejected split: a row missing exam_no, all names,
  serie, or decision is rejected with a clear reason and counted;
  the rest of the file still imports. No code path assumes a year
  implies a field (2022's columns differ from 2021's).
- Column mapping: every historical header set (see fixtures)
  auto-maps its known columns; unknown headers are reported as
  unrecognized; guaranteed-floor absence (no exam_no or no name)
  is reported.
- Loader (against disposable Postgres): inserting the same file
  twice yields identical counts (idempotency); a mid-load failure
  rolls back fully (no partial year).

## Fixtures (mandatory)

`worker/tests/fixtures/` contains one small `.xlsx` per real
historical format, with 6–7 rows each, faithful to the actual
headers (fabricated people only — never real names/data). Column
names/order below are the confirmed real export headers, not an
approximation; see `worker/tests/fixtures/README.md` for the full
per-file breakdown of stored vs. ignored columns and traps:

- 2024/2023 (identical format): NNI, NODOSS, SERIE, NOMPL, LIEUN,
  DATN, NOMPA, LIEUNA, MOYBAC, Libnoets, Libnoetce, Decision,
  WILAYA_FR, WILAYA_AR, LibnoetsAR, LibnoetceAR. NNI/DATN/LIEUN/
  LIEUNA/WILAYA_*/Libnoets*/Libnoetce* are all ignored.
- 2022: Num Bac, Nom, Lieu Naiss, Date Naiss, Nom Ar, Lieu Ar, Type
  Candidature, SERIE, Moy Bac, decision, Motif, Noreg, Wilaya,
  Wilaya Ar, Centre, Centre Ar, Etablissement, Etablissement AR.
  No NNI column at all (contrast with 2021's NNI column) even
  though birth place/date are present — field availability is
  genuinely per-file. Real SERIE values include typos (`SNE`, `ME`,
  `LME`) alongside valid ones; SERIE is stored verbatim, never
  validated against an enum.
- 2021: NOREG, Code, Centre, NNI, Numéro Bac, SERIE, Nom Arabe, Nom,
  Lieu Naiss, Lieu Arabe, MoyBac, Decision, Date Naiss, Ecole.
- 2020: NNI, Numero Bac, Nom, SERIE, Moyenne Bac, Decision. Raw
  SERIE casing is inconsistent (`sn`, `Lo`) before cleaning
  normalizes it; includes `Abscent` and `Examen annulé CT (Usage du
  Téléphone)` rows with a blank moyenne.
- 2019: Code Wilaya, Wilaya, Centre, SERIE, Numéro Bac, Nom, Date
  Naissance, Lieu Naissance, Moyenne, Decision. No NNI column.
  `Ajourné Sn` and `Admis Sn` decisions.
- 2018: NODOSS, SERIE, TYPEC, NOMPL, DATN, MOYG1, LIEUN, Decision,
  Libecole, Libcentre, Noreg, Wilaya. `Ajourné(e)` and `Sessionaire`
  (typo) decisions.
- 2017: NODOSS, SERIE, TYPEC, NOMPL, DATN, LIEUN, Moyg1, Décision
  (accented header), NOREG, LETAB. `Admis Sn`, `Delibérable Sn`,
  `Ajourné Sn` decisions.
- 2015: NODOSS, NOMPL, DATN, LIEUN, SERIE, LETAB, MOYG1, decision
  (lowercase header). `Ajourné(e)` alongside plain `Ajourné`/`Admis`.
- future-minimal (synthetic): ONLY an exam number column (`N° Bac`)
  and one name column (`Nom Complet`) — the guaranteed floor. Rows
  missing serie/decision are rejected with reasons; the file itself
  imports without errors (no crash).

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
smoke pass → publish) is rehearsed on production, unpublished,
with last year's file before every results day, then the
rehearsal import is deleted; the rehearsal is part of the
release checklist, not optional.

## CI Gate

A unit is not done until: `vitest run` (api), `jest` (web), and
`pytest` (worker, when touched) all pass locally and in CI,
alongside build/typecheck/lint. Deployment to production requires
a green CI; production import requires the production, unpublished
rehearsal (project-overview.md release flow).
