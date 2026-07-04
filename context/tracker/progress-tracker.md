# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- In progress

## Current Goal

- None — task 026 is complete. Task 025 (rate limiting and cache headers)
  is implemented on its own branch, not yet merged into main.

## Completed

- **Task 026 — Observability: Sentry, PostHog, Logging**
  - **Sentry, all three runtimes, same pattern everywhere**: env-gated on a DSN
    (`SENTRY_DSN` server-side, `NEXT_PUBLIC_SENTRY_DSN` browser-side) — absent
    DSN means `Sentry.init`/`sentry_sdk.init` is never called, proven by tests
    rather than a guard at every capture call site. `tracesSampleRate`/
    `traces_sample_rate` fixed at `0.1`. `environment` tag reads `APP_ENV` (new
    var, falls back to `NODE_ENV`) server-side; the browser gets its own
    `NEXT_PUBLIC_APP_ENV` (new var) since only `NEXT_PUBLIC_*` reaches it
    (architecture.md invariant 4). Only unexpected errors are ever reported —
    the same expected/unexpected split error-handling.md already defines.
  - **api** (`@sentry/node`): `api/src/instrument.ts` — first-import pattern,
    imported as the very first line of both `server.ts` and `queueWorker.ts`
    (the second Node process). Exports `scrubPii(event)` as the `beforeSend`:
    our own capture calls only ever pass `{requestId}`/`{importId, stage}` as
    context, but Sentry's http integration auto-captures the request
    URL/query-string/cookies — any of which could carry `?no=00573` or a
    session token — so `scrubPii` strips `query_string`, `cookies`, `data`,
    the `cookie` header, and the URL's query part defensively, regardless of
    what any current or future route does. `app.ts`'s `onError` unexpected
    branch calls `Sentry.captureException(err, {extra: {path, method,
    requestId}})` — the `HTTPException` branch (expected errors) never does.
    `queueWorker.ts`: `'failed'` only reports to Sentry when the error is NOT
    an `ImportJobError` (worker.py's own expected failure contract, already
    surfaced via `failureReason`); `'error'` (BullMQ connection errors) always
    reports. `importJob.ts`'s smoke-verification catch (already a deliberate
    fail-closed swallow, not a rethrow) now also reports to Sentry with
    `{importId, stage: 'smoke-verification'}` — it was a silent console.error
    before this task.
  - **worker** (`sentry-sdk`): `worker.py`'s `init_sentry()` called first thing
    in `main()`. `include_local_variables=False` is the *primary* PII defense
    here, not `before_send` — Python's SDK attaches local variables from every
    stack frame by default, and a frame at the point of an unexpected
    exception in this pipeline could otherwise dump the whole in-memory
    dataframe (real names) into the event. Only the outer `except Exception`
    around `run_import()` in `main()` reports to Sentry, with
    `sentry_sdk.set_context('import', {import_id, file_id, stage:
    'run_import'})` — every other failure path (`validate()`'s
    `VALIDATION_ERROR`, `run_import()`'s own `IMPORT_NOT_FOUND`/
    `MISSING_REQUIRED_COLUMNS`/`UNREADABLE_FILE` returns) is expected and
    never reaches Sentry, matching the Node side's philosophy exactly.
  - **web** (`@sentry/nextjs`): Next.js 16's file-convention hooks, not the
    older `sentry.server.config.js` pattern — `instrumentation.ts` exports
    `register()` (server/edge init) and `onRequestError` (forwards to
    `Sentry.captureRequestError`, which Next's `onRequestError` instrumentation
    hook calls for unexpected SSR/RSC/route-handler errors); `instrumentation-
    client.ts` inits the browser SDK. Both share `web/lib/sentryScrub.ts`'s
    `scrubPii` as `beforeSend` (same reasoning as the api's). `app/[lang]/
    error.tsx` and `app/global-error.tsx` (React error boundaries) now also
    call `Sentry.captureException(error)` in their effect — a boundary stops
    an error from ever reaching `window.onerror`, so without this call
    Sentry would never see client-side render errors at all.
  - **PostHog** (`posthog-js`, browser only): `web/lib/analytics.ts`,
    env-gated on `NEXT_PUBLIC_POSTHOG_KEY` (already-existing var). No
    `identify()` call exists anywhere in the app, so `person_profiles:
    'identified_only'` means no visitor ever gets a full PostHog person
    profile. `autocapture: false` — only the agreed event set below is ever
    sent, never raw DOM interactions (which could capture a rendered name in
    a clicked element's text). `disable_session_recording: true` — a result
    page renders a real name; never risk it in a replay. Mounted via
    `web/components/AnalyticsInit.tsx` in the true root `app/layout.tsx`
    (the one layout above both `[lang]` and `admin`, so one mount point
    covers everything) — a `useEffect` on mount, after hydration
    (code-standards.md: "no blocking third-party scripts").
  - **The agreed event set**, all shapes/counts only, verified PII-free by
    the tests: `result_searched {method: 'examNo'|'name'}` fires on every
    exam-number submit (`SearchTabs`) and every autocomplete suggestion pick
    (`NameAutocomplete`), regardless of outcome. `autocomplete_shown {count,
    queryLength}` / `autocomplete_empty {queryLength}` fire once each
    debounced name search resolves. `result_opened {searchAttempts}` fires
    once on the result page itself (`ResultOpenedTracker`, since the page is
    a Server Component and needs a client child for the side effect) —
    `searchAttempts` is how many searches (exam submits or autocomplete
    picks) happened this browser session before landing here, a friction
    signal resolved with the user during this task (not otherwise specified)
    as "search attempts before success", tracked via a `sessionStorage`
    counter (`recordSearchAttempt`/`consumeSearchAttempts` in `analytics.ts`;
    sessionStorage rather than component state because the counter must
    survive the client-side navigation from the search form to the result
    page). `admin_upload_started` fires once the upload API accepts the file
    (`upload/page.tsx`, right before navigating to mapping). `admin_upload_
    completed` fires when the imports dashboard's live-status poll
    (`imports/page.tsx`, task 024) observes a `processing` → `completed`
    transition for a given import id — tracked via a `Map<importId,
    lastStatus>` ref, so it fires exactly once per completion and never for
    an import that was already `completed` on first load. `admin_publish
    {action: 'publish'|'unpublish'}` fires right after the publish/unpublish
    API call succeeds (`imports/[importId]/page.tsx`).
  - **Logging**: `importJob.ts` gained an `info`-level "import finished" log
    with `{importId, inserted, rejected, duplicatesSkipped}`, plus a
    `warn`-level "import completed with rejected rows" log when `rejected >
    0` — the two Logging Conventions bullets (`info` for lifecycle-with-
    counts, `warn` for expected-but-notable) that weren't wired up yet.
  - **New env vars** (`.env.example` + `deployment.md`): `APP_ENV` (api, web
    server-side, worker — was already read by `scripts/seed.ts` and
    `scripts/build-search-index.ts` but had never been added to either file;
    fixed as part of this task since Sentry's environment tag needed it
    documented properly) and `NEXT_PUBLIC_APP_ENV` (web browser-side copy,
    genuinely new).
  - **Chore — fixed a broken web dependency this task surfaced**:
    `@testing-library/dom` (a peer dependency of `@testing-library/react`)
    was never listed explicitly in `web/package.json`; installing
    `@sentry/nextjs`/`posthog-js` re-resolved the workspace's dependency tree
    and dropped the previously-hoisted copy, breaking every test that
    imports `@testing-library/react` (`screen`/`waitFor` become unresolvable
    modules). Added it as an explicit devDependency — this was a pre-existing
    gap, not something introduced by this task, but it blocked verifying any
    web test.
  - **Tests** (api: 26 new across 3 files; web: 57 total, up from the
    pre-existing 29 that were themselves blocked by the dependency bug
    above; worker: 6 new): api — `instrument.test.ts` (init gating +
    `scrubPii`), `app.test.ts` additions (unexpected error → Sentry with
    requestId context; `HTTPException`/404 → never), `importJob.test.ts`
    addition (smoke-verification throw → Sentry with `{importId, stage}`).
    worker — `test_worker_sentry.py` (init gating, `include_local_variables`,
    `_scrub_pii`, unexpected `run_import` exception → Sentry with `{import_id,
    file_id, stage}`, expected `VALIDATION_ERROR`/`IMPORT_NOT_FOUND` outcomes
    never reach it) — all DB-free (`run_import` monkeypatched), no Postgres
    needed. web — `analytics.test.ts` (every track* helper, PII-free payload
    assertion via a name/decision regex scan, inert without the PostHog key),
    `sentryScrub.test.ts`, `instrumentation.test.ts`/`instrumentation-
    client.test.ts` (init gating for both runtimes, `onRequestError`
    forwarding), `error.test.tsx`/`global-error.test.tsx` (Sentry capture from
    the boundary), `AnalyticsInit.test.tsx`/`ResultOpenedTracker.test.tsx`,
    plus wiring assertions added to `SearchTabs`/`NameAutocomplete`/upload
    page/imports list/import detail page's own (new or existing) test files.
  - **Manually verified**: `next build` clean, all three runtimes' full test
    suites green with real Postgres/Redis/Meilisearch running
    (`docker compose up -d`) — api 174/174, web 57/57, worker 195/195;
    `tsc --noEmit`, `eslint --max-warnings=0`, `ruff check`, `black --check`
    all clean.
  - **Deliberately out of scope (per task spec)**: dashboards/alerts inside
    Sentry/PostHog themselves — documented as external-tool setup, not code.
    `queueWorker.ts`'s event-handler logic remains untested in isolation
    (consistent with its own pre-existing "entry point only, testable logic
    lives in services/" convention — it was untested before this task too).

- **Chore — Admin visual parity with the flat design system + Next.js ISR cache-invalidation fix**
  - **Admin redesign**: brought every admin page (`login`, `AdminSidebar`, imports list, mapping, upload, import detail/publish) into visual parity with the public flat Notion-document system instead of the old "stays plain, functional" contrast — `rounded-full` pill buttons → `rounded-md`; boxed `bg-card`/`border`/`rounded-lg` tables and property panels → bare tables/lists directly on the canvas with hairline separators only; dashed-border empty-state "card" → quiet centered text with an underlined action; status badges `rounded-full` → `rounded-xs` tag shape; login header's uppercase tracked eyebrow → a plain wordmark.
  - **Bug fix — published years not appearing after publish**: the home page's published-years list is fetched with Next.js ISR (`next: { revalidate: 3600 }`), a cache layer that lives inside the Next.js process and is completely separate from the api's Redis cache — so even though `publish.ts` already correctly invalidated `years:published` in Redis, a freshly published year wouldn't show up in the year selector until the next hourly ISR revalidation. Fixed by tagging the fetch (`tags: ['published-years']`, a literal string in both places — importing a shared constant into the route broke Turbopack's dev SSR bundling with a "require is not defined" error) and adding a session-gated route handler (`web/app/api/internal/revalidate-published-years/route.ts`) that calls `revalidateTag(tag, { expire: 0 })` — the immediate-expiration form Next's docs call out for webhook/external-trigger invalidation. The admin's publish/unpublish action calls this route right after the api call succeeds, best-effort (a failure here doesn't fail the publish itself). `web/proxy.ts` skips `/api/*` from locale routing so the internal route handler isn't treated as a locale-prefixed page.
  - **Chore — Clear the pre-existing `npm run lint` debt**: fixed root causes rather than suppressing rules. `api/scripts/*.ts` weren't type-checked at all (`api/tsconfig.json`'s `include` only listed `src/**/*`); added `scripts/**/*` and dropped the now-conflicting `rootDir: "src"`. This surfaced real, previously-invisible type errors: `build-search-index.ts` was constructing its own schema-less `drizzle(pool)` instance and force-casting it to `Db` (now passes `{ schema }` like every other script, no cast needed); `create-admin.ts` had a floating top-level promise, now `.catch()`-terminated so an unhandled rejection can't silently exit 0. `app.ts` had one redundant `as {code:string}` cast on a value TypeScript already narrows without it (Hono's `HTTPException.cause` is typed as `unknown`, but the preceding `'code' in err.cause` check already narrows it once `err.cause` is confirmed to be a non-null object).
  - Documented in `context/tasks/030-results-day-rehearsal.md` (spec added for the results-day rehearsal task, not yet implemented — depends on the deploy task, 029).
  - Verified no behavior changed: full `vitest run`, `jest`, and `pytest` all still pass; `tsc --noEmit` and `next build` clean for every package; `npm run lint` — zero errors, zero warnings, repo-wide.
  - **Not done (deliberately)**: did not touch `worker/` (Python has its own `ruff`/`black`, already clean) or add new lint rules/config — this was a debt payoff, not a policy change.

- **Task 001 — Scaffold Monorepo**
  - Created directory structure: `web/`, `api/`, `shared/`, `worker/`, `scripts/`, `uploads/`
  - npm workspaces configured for `web`, `api`, `shared`; `worker` is an independent Python package
  - Root `tsconfig.base.json` with strict mode; each TS workspace extends it with `"files": []` until source is added
  - ESLint 9 flat config (`eslint.config.mjs`) with `@typescript-eslint` strict rules + Prettier integration
  - `.prettierrc` configured
  - Root scripts: `build`, `lint`, `typecheck`, `test` — all passing on empty workspaces
  - `.gitignore` covering `.env*`, `node_modules`, build outputs, `uploads/*`, Python caches/venv
  - `CLAUDE.md` referencing all context files and `ai-workflow-rules.md`
  - `README.md` with project summary, install steps, and script table
  - `worker/README.md` noting Python-only setup for a later task

## Completed

- **Task 002 — Development Docker Infrastructure**
  - Created `docker-compose.yml` with pinned images: `postgres:16-alpine`, `redis:7-alpine`, `getmeili/meilisearch:v1.11.0`
  - Named volumes for Postgres, Redis, and Meilisearch data
  - Healthchecks on all three services (`pg_isready`, `redis-cli ping`, Meilisearch `/health` endpoint)
  - All ports bound to `127.0.0.1` only (no external exposure)
  - Created `.env.example` covering all env vars: DB, Redis, Meili, auth, URLs, Sentry, PostHog, Cloudflare
  - Added "Local Infrastructure (Docker)" section to `README.md` covering start/stop, data locations, and reset flow
  - Updated `deployment.md` with all 17 new environment variables

## Completed

- **Task 003 — Database Schema & Migrations**
  - Installed `drizzle-orm`, `pg` (pool max 20), `drizzle-kit`, `vitest` in `api/`
  - Created `api/src/db/schema.ts`: 7 tables (`attempts`, `persons`, `person_links`, `link_suggestions`, `imports`, `rejects`, `column_aliases`) + 4 pg enums (`decision`, `import_status`, `link_method`, `suggestion_status`)
  - Created `api/src/db/client.ts`: `pg.Pool` with `max: 20`, `drizzle(pool, { schema })`
  - `api/drizzle.config.ts` wired to `DATABASE_URL` from root `.env`
  - Migration `drizzle/0000_odd_bruce_banner.sql` generated by drizzle-kit and applied to local Postgres; re-run is a no-op
  - All constraints in place: `UNIQUE(exam_year, exam_no)` on `attempts`, `UNIQUE(attempt_id)` on `person_links`, `UNIQUE(raw_header)` on `column_aliases`; indexes on `nni`, `match_key`, `person_links.person_id`
  - 10 integration tests in `api/src/db/__tests__/schema.test.ts` proving uniqueness violations (pg error code 23505), leading-zero preservation, happy paths, and schema export completeness — all pass
  - `tsc --noEmit` clean

## Completed

- **Task 004 — Hono API Skeleton**
  - Installed `hono`, `@hono/node-server`, `ioredis` in `api/`
  - App/server split: `api/src/app.ts` exports `createApp()` (testable via `app.request()`); `api/src/server.ts` is the Node entry
  - Baseline middleware: `requestId` (UUID per request, `X-Request-Id` header), `requestLogger` (structured JSON), `secureHeaders()`, `cors()` (origin from `WEB_URL` env var)
  - Central error handling: `app.onError` — `HTTPException` → standard error shape + status, unexpected errors → `{ error: { code: "INTERNAL", message: "Internal Server Error" } }` (no internals leaked); `app.notFound` → 404 standard shape
  - `GET /health` — liveness, no dependencies, always 200
  - `GET /health/ready` — checks Postgres (`SELECT 1`), Redis (PING via ioredis), Meilisearch (`/health` fetch); returns 503 with per-dependency booleans when any check fails
  - `api/src/lib/healthChecks.ts` — injectable check functions (mocked in tests)
  - `eslint.config.mjs` — fixed pre-existing parse error for `api/*.config.ts` files using `allowDefaultProject` + `defaultProject: 'tsconfig.base.json'`
  - 11 new tests in `api/src/__tests__/app.test.ts` (21 total in api), all passing; `tsc --noEmit`, lint, build all clean

## Completed

- **Task 005 — Next.js Skeleton with i18n**
  - Bootstrapped Next.js 16.2.9 in `web/` via `create-next-app@latest` (App Router, TypeScript strict, Tailwind CSS v4)
  - Initialized shadcn/ui (base-nova style, neutral base color, RSC mode, `components/ui/`, `lib/utils.ts`)
  - i18next configured with FR/AR locales; `dictionaries/ar.json` and `dictionaries/fr.json` as translation sources
  - `proxy.ts` (Next.js 16 renamed middleware) handles locale detection + redirect; Arabic is default locale
  - `app/[lang]/layout.tsx` as root locale layout: dynamic `lang`/`dir` attributes, both flip with locale
  - Language switcher (`components/LanguageSwitcher.tsx`) preserves current page path on locale switch
  - Three Thmanyah typefaces (Sans, Serif Display, Serif Text) loaded via `next/font/local` from `public/fonts/`; Geist retained for Latin
  - Font CSS variables exposed on `<html>` for use by design skill
  - Route-level `app/[lang]/error.tsx` and global `app/global-error.tsx` with `unstable_retry` per Next.js 16 API
  - `shared/src/api.ts` defines `ApiSuccessResponse<T>` and `ApiErrorResponse`; `web/lib/api.ts` implements typed `apiRequest<T>` and `ApiClientError`
  - Jest 30 + React Testing Library + jest-axe configured via `next/jest.js`; `jest.config.ts` + `jest.setup.ts`
  - 7 tests pass: 5 `LanguageSwitcher` tests (axe in both locales + path/hrefLang assertions) + 2 i18n key-parity tests
  - Key-parity test fails CI if any key is missing in a locale (proven by symmetric diff check)
  - `next build` produces `/ar` and `/fr` static pages + Proxy; all root scripts (build, typecheck, lint, test) pass

## Completed

- **Task 006 — Development Seed Data**
  - `api/src/db/match-key.ts`: exports `computeMatchKey(name, birthDate, birthPlace)` — pure SHA-256 function used by both the seed and future worker; strips case, whitespace, and combining diacritics
  - `api/src/db/__tests__/match-key.test.ts`: 11 unit tests covering nullability, case/whitespace/diacritic normalisation, and hash stability; all pass
  - `api/scripts/seed.ts`: idempotent seed script producing 298 attempts across 3 exam years (2022 published, 2023 published, 2024 unpublished); covers all required scenarios:
    - Redemption: one person with Ajourné (2022) → Admis (2023), NNI-linked across years
    - Identical-name pair with different birth places ("Mohamed Ould Ahmed", Nouakchott vs. Nouadhibou)
    - Arabic-only, French-only, and bilingual persons
    - All 6 normalized decision values with realistic raw source strings
    - All 7 SERIE values (SN, LM, LO, M, TM, TS, LA)
    - 10 cross-year NNI-linked bulk persons; 5 cross-year match_key-linked bulk persons
    - 1 pending link_suggestion for the same-name/different-place pair
    - Production guard: exits if APP_ENV or NODE_ENV is "production"
  - `api/scripts/verify-seed.ts`: assertion script with 29 checks; exits 0 on pass, 1 on fail
  - `api/package.json`: added `tsx` devDep, `db:seed`, and `db:verify-seed` scripts
  - Done-when checklist: two consecutive runs yield identical counts ✓; all scenarios queryable (29/29 assertions pass) ✓

## Completed

- **Task 007 — Exam-Number Search API**
  - `shared/src/search.ts`: `ExamSearchResult`, `ExamSearchResponse`, `PublishedYearsResponse` — shared types consumed by both api and web
  - `api/src/schemas/examSearch.ts`: Zod schema validating `no` (digits-only, required) and `year` (coerced int, 1900–2100)
  - `api/src/lib/redis.ts`: shared ioredis singleton (lazy-connect false, 2 retries)
  - `api/src/services/examSearch.ts`: `searchByExamNo` and `getPublishedYears` with Redis cache-aside (TTL 300 s for exam lookups, 3600 s for years list); `invalidateExamCache` and `invalidateYearsCache` exported for future import/publish flow
  - `api/src/routes/search.ts`: `GET /api/search/exam?no=&year=` and `GET /api/search/years`; zValidator on query params; STUDENT_NOT_FOUND via HTTPException cause pattern
  - `app.ts`: `app.onError` updated to extract error code from `HTTPException.cause.code` before falling back to status-map; searchRouter mounted at `/api/search`
  - 13 new tests (45 total in api), all passing: happy path, malformed number → 400, missing params → 400, unknown number → 404 STUDENT_NOT_FOUND, unpublished year → 404, same exam number two years → different personIds, published years endpoint, Redis cache-hit skips DB (via `vi.importActual`), DB miss writes to cache, no-rows returns null without cache write
  - `tsc --noEmit` clean for api and shared; all 45 tests pass

## Completed

- **Tooling/Config — Root Dev Script & Dependency Alignment**
  - Added `concurrently ^9.0.0` as root devDependency; installed 9.2.3
  - Root `dev` script: `concurrently --names "web,api" --prefix-colors "green,cyan" "npm run dev --workspace=web" "npm run dev --workspace=api"` — labeled, colored, Ctrl-C stops both
  - Pinned `typescript` in `api/package.json` and `shared/package.json` from `"*"` to `"^5.0.0"` to match root
  - Aligned `@types/node` to `^22` in both `api/` (was `^25.9.3`) and `web/` (was `^20`) for Node 22 LTS
  - `npm install`, `build`, `typecheck` all pass; schema integration tests fail only due to Postgres not running (pre-existing infra issue, unrelated to this change)

## Completed

- **Task 008 — Student Page API**
  - `shared/src/student.ts`: `StudentAttempt`, `SeeAlsoEntry`, `StudentPageData`, `StudentPageResponse` — shared types consumed by api and web
  - `api/src/services/studentPage.ts`: `getStudentPage` with Redis cache-aside (TTL 3600 s); queries published attempts newest-year-first; resolves see-also from pending link_suggestions in both directions (external attempt → our person; our attempt → other person); deduplicates by other person ID; `invalidateStudentCache` exported for future import/publish flow
  - `api/src/routes/students.ts`: `GET /api/students/:personId`; zValidator on param (positive integer); STUDENT_NOT_FOUND via HTTPException cause pattern
  - `app.ts`: studentsRouter mounted at `/api/students`
  - 11 new tests (58 total in api), all passing: single-attempt happy path, multi-attempt order (newest first), see-also present for pending suggestion, see-also absent otherwise, 404 for unknown person, 404 for unpublished-only person, 400 for non-numeric id, Redis cache-hit skips DB, no-links returns null without cache write, unpublished-only returns null without cache write, DB hit writes full payload to cache
  - `tsc --noEmit` clean for api and shared; all 58 tests pass

## Completed

- **Task 009 — Meilisearch Indexing & Name Search API**
  - `meilisearch` v0.58.0 added to `api/` dependencies (note: class is now `Meilisearch`, not `MeiliSearch` — breaking rename in v0.40+)
  - `shared/src/name-search.ts`: `NameSearchSuggestion`, `NameSearchResponse` — shared types consumed by api and web
  - `api/src/lib/meili.ts`: `Meilisearch` client singleton; exports `meili`, `MeiliClient` type, and `PERSONS_INDEX` constant
  - `api/src/services/meiliIndex.ts`: `buildNameIndex(db, meili)` — queries Postgres with `DISTINCT ON` to get one document per person (most recent published attempt); configures searchable (`nameFr`, `nameAr`) and sortable (`latestYear`) attributes; full rebuild (deleteAllDocuments → addDocuments)
  - `api/src/schemas/nameSearch.ts`: Zod schema validating `q` (min 2 chars)
  - `api/src/services/nameSearch.ts`: `searchByName(meili, query)` — queries `persons` index with `limit: 10`, `sort: ['latestYear:desc']`
  - `api/src/routes/search.ts`: `GET /api/search/name?q=` added to existing search router
  - `api/scripts/build-search-index.ts`: standalone CLI rebuild script
  - `api/package.json`: `search:reindex` script added
  - 11 new tests (69 total in api), all passing: route validation, happy path, empty results, Arabic input, 10-result cap, index-builder document shape + unpublished exclusion, searchByName service mapping
  - `tsc --noEmit` clean for api and shared; all 69 tests pass

## Completed

- **Task 013 — Admin Authentication (Better Auth)**
  - Installed `better-auth@^1.6.23` in `api/`
  - Added 4 Better Auth tables to `api/src/db/schema.ts`: `auth_user`, `auth_session`, `auth_account`, `auth_verification` (prefixed to avoid PostgreSQL reserved-word conflicts)
  - Generated and applied migration `api/drizzle/0003_motionless_sasquatch.sql`
  - Created `api/src/lib/auth.ts`: Better Auth instance with Drizzle adapter, email+password only, `trustedOrigins` from env
  - Updated `api/src/types.ts`: `AuthSession` type aligned to Better Auth's response shape; `session?` added to `AppEnv.Variables`
  - Updated `api/src/app.ts`: mounted `auth.handler` at `GET/POST/PUT/DELETE/PATCH /api/auth/*`; blocked `POST /api/auth/sign-up/email` with 403; added `credentials: true` to CORS
  - Created `api/src/middleware/requireSession.ts`: calls `auth.api.getSession`, throws 401 if null, stores session on context
  - Created `api/scripts/create-admin.ts`: idempotent script using `auth.api.signUpEmail`; reads `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` from env; gracefully handles duplicate-email error
  - Added `auth:create-admin` script to `api/package.json`
  - Updated `web/app/admin/[lang]/(shell)/layout.tsx`: session check on every shell page — fetches `API_URL/api/auth/get-session` server-to-server with forwarded cookie; redirects to login if no session
  - Fixed `web/app/admin/[lang]/(auth)/login/page.tsx`: sign-in fetch now uses `NEXT_PUBLIC_API_URL` (Hono API, not Next.js route)
  - Fixed `web/components/admin/AdminSidebar.tsx` logout: POST to `NEXT_PUBLIC_API_URL/api/auth/sign-out` before redirect
  - Added auth tests: 5 tests covering `requireSession` 401/200/header-forwarding, signup block 403, and auth handler delegation — all pass (74 total)
  - Added `vi.mock('../lib/auth.js', ...)` to all existing test files that import `createApp` so they don't break
  - `tsc --noEmit` clean for both `api/` and `web/`

## Completed

- **Chore — Public Person ID (anti-enumeration)**
  - Added `public_id text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', '')` to the `persons` table via migration `0004_persons_public_id.sql` (Postgres 13+ built-in, no extension required).
  - Drizzle schema updated with `.default(sql\`replace(gen_random_uuid()::text, '-', '')\`)` so all inserts auto-generate the ID; integer `id` PK unchanged and used for all internal joins.
  - `GET /api/students/:publicId` now accepts any URL-safe string (regex `[a-zA-Z0-9_-]+`, max 64 chars) instead of digits-only.
  - `studentPage.ts`: resolves `public_id` → internal integer PK on the first query, then uses integer FK for all joins; Redis cache key is `student:{publicId}`; response `personId` and `seeAlso[].personId` are now the `public_id`.
  - `examSearch.ts`: joins `persons` to return `public_id` as the response's `personId`.
  - `meiliIndex.ts`: Meilisearch document `id` is now `persons.public_id` (not `person_id::text`).
  - All shared types (`StudentPageData`, `SeeAlsoEntry`, `NameSearchSuggestion`, `ExamSearchResult`) remain `personId: string` — no changes needed.
  - Frontend unchanged — personId was already treated as an opaque string in all URL construction.
  - All 75 tests pass; `tsc --noEmit` clean for api, web, and shared.

## Completed

- **Task 013b — Retrofit: Simplify to the Minimal-Data Model**
  - **Identifier decision:** a result page is now identified by **(exam_year, exam_no)** — the same pair used by exam-number search and carried by every search-result link. No opaque person id.
    - API: `GET /api/students/:examYear/:examNo` (Zod: year 1900–2100, examNo digits-only).
    - Web: `/[lang]/students/[examYear]/[examNo]` (old `[personId]` route removed).
    - Redis result-page key: `student:{examYear}:{examNo}`.
    - Meilisearch document id: `{examYear}-{examNo}`, one doc PER PUBLISHED ATTEMPT (index renamed `persons` → `attempts`, sortable on `examYear`).
  - **Migration** `drizzle/0005_tricky_pretty_boy.sql` (generated via drizzle-kit): drops `person_links`, `link_suggestions`, `persons`; drops `attempts.nni/birth_date/birth_place/school/wilaya/match_key` and the nni/match_key indexes; drops the `link_method` and `suggestion_status` enums. Runs clean on a fresh DB (0000→0005); re-run is a no-op (drizzle migration ledger).
  - **Schema:** removed `persons`/`personLinks`/`linkSuggestions` tables and the two link enums from `schema.ts`. `attempts` is now the only result-bearing table and stores only exam_year, exam_no, name_fr, name_ar, serie, moyenne, decision, decision_raw, import_id.
  - **Services:** `studentPage` is a single-attempt published lookup by (year, no); `examSearch` no longer joins persons; `meiliIndex`/`nameSearch` index/query one document per published attempt.
  - **Shared types:** `StudentPageData`/`StudentAttempt`/`SeeAlsoEntry` → single `StudentResult`; `NameSearchSuggestion` and `ExamSearchResult` dropped `personId` (and `latestYear`/`birthPlace`).
  - **Web:** `StudentResultCard` rewritten to a single-result view (name, decision hero + moyenne count-up, year + serie rows) — no history, no see-also; `NameAutocomplete`/`SearchTabs` link by year+no and drop birthplace/wilaya meta; admin **Suggestions** page + sidebar nav removed; mapping page dropped the `nni`/`date_naissance`/`lieu_naissance`/`wilaya`/`etablissement` canonical fields; see-also, merge-suggestion, and school/wilaya i18n keys removed from both locales (FR/AR parity preserved).
  - **Seed:** regenerated attempts-only — 300 rows across 2022/2023 (published) and 2024 (unpublished); covers all 6 decisions, all 7 series, FR-only/AR-only/bilingual names, a null-moyenne (Annulé) row, and names repeated across years and within a year as SEPARATE rows. `verify-seed` rewritten (27/27 assertions pass); `truncate` updated; `match-key.ts` + its test deleted.
  - **Tests:** api 59/59 pass (incl. schema integration against the migrated DB); web 7/7 pass (i18n parity). `tsc --noEmit` clean for api/shared/web; `next build` clean.
  - **Verified:** no reference to nni/birth_date/birth_place/match_key/person_links/link_suggestions/see-also remains in api/, shared/, or web/ (except the negative-assertion tests in `schema.test.ts`).

- **Task 009 — Name Search API (rewritten: grouped by year)**
  - The rewritten spec (one document PER PUBLISHED ATTEMPT, each matching attempt returned as its own year-labeled row, no person merging) was implemented during the 013b retrofit and re-verified here against the new spec.
  - `meiliIndex.buildNameIndex` indexes one doc per published attempt: id `{examYear}-{examNo}`, plus examYear/examNo/nameFr/nameAr/serie; searchable on nameFr+nameAr, sortable on examYear; only published years indexed; full rebuild (deleteAll → addDocuments).
  - `nameSearch.searchByName`: query ≥ 2 chars (Zod), typo-tolerant (Meili), FR + AR input, `limit: 10`, `sort: ['examYear:desc']` → newest year first.
  - Route `GET /api/search/name?q=` unchanged (min-2 validation, 400 on invalid).
  - **Tests (12, Meili mocked):** validation (missing/1-char), 10-cap, a name in 3 years → 3 documents with distinct ids, endpoint returns 3 separate newest-first rows each carrying year + serie, Arabic input, empty results; service maps hits and asserts the `examYear:desc` sort.
  - **Manual check on real local Meilisearch** (200 published attempts indexed via `search:reindex`): Arabic `أحمد`/`محمد` return matching attempts; typo'd French `Mohamd` returns "Mohamed Ould Ahmed"/"Ahmed Ould Mohamed"; "Ahmed Ould Mohamed" returns its 2023 and 2022 sittings as separate rows, newest first.
  - Note: the earlier per-person "Task 009" entry above (DISTINCT ON persons, `latestYear`, `birthPlace`) is superseded by this attempt-based rewrite.

- **Chore — Non-enumerable public result URLs (public_slug)**
  - **Why:** public result URLs were `/{lang}/students/{year}/{examNo}` — trivially enumerable because exam numbers are sequential. Added a random, unguessable public handle used only in URLs, without changing internal identity.
  - **Schema:** `attempts.public_slug TEXT NOT NULL UNIQUE`, DB-side `DEFAULT replace(gen_random_uuid()::text,'-','')` (uuid-hex, 32 chars, URL-safe, extension-free). DB default so every inserter (seed, future Python loader, admin, manual SQL) self-populates it — no Drizzle `$defaultFn`, no app code. Internal identity stays `(exam_year, exam_no)` with its UNIQUE constraint unchanged.
  - **Migration** `drizzle/0006_organic_satana.sql` (never edits an applied one): staged — add nullable → backfill existing rows → `SET DEFAULT` → `SET NOT NULL` → `CREATE UNIQUE INDEX attempts_public_slug_unique`.
  - **API:** public page URL is now `/{lang}/results/{slug}`; API is `GET /api/results/:slug` (route file renamed `students.ts` → `results.ts`, mounted `/api/results`, slug validated URL-safe ≤64). `studentPage.getStudentPage(db, redis, slug)` looks up by `public_slug` + published; Redis key `result:{slug}`; `invalidateStudentCache(redis, slug)`. Exam-number search still resolves internally by `(exam_year, exam_no)` but now returns and links via `slug`. Meili document **id = slug** (payload keeps examYear/examNo/serie/names); `nameSearch` maps `hit.id` → `slug`. Reindex after migration (Meili is derived).
  - **Shared types:** `slug` added to `StudentResult`, `ExamSearchResult`, `NameSearchSuggestion`.
  - **Web:** route moved to `app/[lang]/results/[slug]/page.tsx` (fetches `/api/results/{slug}`); `SearchTabs` and `NameAutocomplete` link via `/{lang}/results/{slug}`. `StudentResultCard` unchanged.
  - **Tests:** result lookup by slug (found + 404 + unpublished + invalid/oversized slug), Redis key `result:{slug}`, exam-search + autocomplete results carry a slug, index doc id = slug, and schema tests proving `public_slug` is auto-populated, NOT NULL, UNIQUE, and stable across reads.
  - **Docs:** `architecture.md` storage model notes public_slug as the only public URL handle (internal identity stays exam_year+exam_no) and the updated Redis/Meili keying.
  - **Note:** the slug removes URL enumeration of result pages, not the by-exam-number lookup (that endpoint remains a deliberate product feature, guarded by rate limiting).

## In Progress

- None.

## Next Up

- Task 020 (real Python loading logic — check `context/tasks/` for the spec)

## Completed

- **Task 015 — Python Worker Skeleton & Fixtures**
  - `worker/` Python 3.12 package: `requirements.txt` (pandas 2.2.3, openpyxl 3.1.5), `requirements-dev.txt` (+ pytest 8.3.4, ruff 0.8.4, black 24.10.0), `pyproject.toml` (black/ruff line-length 100 target py312, `pytest.ini_options` with `testpaths=["tests"]` and `pythonpath=["."]` so `import worker` resolves in tests), `Dockerfile` (`python:3.12-slim`, installs requirements, entrypoint `python worker.py`) — not yet wired into any compose file (that's later deploy tasks).
  - `worker/worker.py`: CLI stub. Flags `--file-id`, `--exam-year`, `--mapping` (JSON string) are deliberately NOT `required=True` in argparse — a missing flag must still produce the standard JSON contract, not argparse's own usage-and-exit-2 behavior. Validates presence, exam-year as an int in [1900, 2100], and mapping as valid JSON parsing to an object. Always prints exactly one JSON line to stdout: failure → `{"ok": false, "code": "VALIDATION_ERROR", "reason": "..."}` + exit 1 (per error-handling.md's worker contract); success → `{"ok": true, "inserted": 0, "rejected": 0, "duplicates_skipped": 0}` + exit 0 — the stub reuses the eventual loader's (task 020) summary shape so the Node-side caller (task 019) can already parse a stable contract.
  - **Fixtures corrected against real historical export headers** (maintainer supplied actual column names/order/traps mid-task; initial draft was a plausible-but-wrong guess from testing.md's abbreviated lists — rebuilt to match reality exactly, all row values remain fully fabricated). Confirmed real layouts, notably: 2024/2023 share one 16-column format (`NNI, NODOSS, SERIE, NOMPL, LIEUN, DATN, NOMPA, LIEUNA, MOYBAC, Libnoets, Libnoetce, Decision, WILAYA_FR, WILAYA_AR, LibnoetsAR, LibnoetceAR` — Arabic name column is `NOMPA`, not the guessed `NOM_AR`; `Libnoets`/`Libnoetce` are school/exam-center labels, not a mystery column); 2022 has NO NNI column but DOES have `Lieu Naiss`/`Date Naiss` (birth data ≠ NNI presence — they vary independently per file, not a clean split); 2021 has NNI; SERIE values are stored verbatim with no enum validation (2022's real data has typos `SNE`/`ME`/`LME`; 2020's raw casing is inconsistent, e.g. `sn`/`Lo`); decision header spelling itself varies (`Decision`, `decision` in 2022/2015, `Décision` accented in 2017). Full breakdown in `worker/tests/fixtures/README.md`.
  - Fixtures: `2024.xlsx`, `2023.xlsx`, `2022.xlsx`, `2021.xlsx`, `2020.xlsx`, `2019.xlsx`, `2018.xlsx`, `2017.xlsx`, `2015.xlsx` (6–7 rows each), `future_minimal.xlsx` (5 rows, synthetic guaranteed-floor: only `N° Bac` + `Nom Complet`). All cell values written as Python strings (never numeric) so leading zeros on exam numbers survive `pandas.read_excel(dtype=str)` — verified for `2022`/`2021`/`2020`/`2018`/`future_minimal`.
  - `worker/tests/fixtures/README.md`: per-file table of exam-no/name/serie/moyenne/decision columns, which columns are ignored, and each file's traps.
  - `worker/tests/test_fixtures.py`: parametrized smoke test asserting each fixture's exact header list (incl. ignored columns) and row count in [5, 10]; a coverage test that every `.xlsx` on disk has a header expectation; a leading-zero preservation test on the fixtures that actually have leading zeros in their real data.
  - `worker/tests/test_worker_cli.py`: 12 tests covering valid invocation (empty and non-empty mapping), missing/blank file-id, missing/non-numeric/out-of-range exam-year, missing/malformed/non-object mapping, and that exactly one JSON line is printed.
  - 30/30 pytest pass; `ruff check .` and `black --check .` clean.
  - `testing.md`'s Fixtures section rewritten to list the confirmed real headers per year (previously an abbreviated/approximate list).
  - **Deliberately out of scope (per task spec):** no real mapping/cleaning/loading logic — `cleaning.py`/`mapping.py`/`loader.py` don't exist yet (016–020).

  Note (this batch): `worker.py`/`test_worker_cli.py` land in a later commit,
  already in their final task-020 form — see that entry below — since only
  one final version of each file exists to commit.

- **Task 016 — Column Mapping Module**
  - `worker/mapping.py`: pure, DB-free module (no pandas/I/O) — `analyze_headers(headers, learned_aliases=None)` is the entry point.
  - `normalize_header`: NFKD-decomposes and drops combining marks (strips accents: "Numéro Bac"/"Numero Bac"/"Décision" all normalize identically), then replaces any non-alphanumeric character (spaces, `_`, `°`, apostrophes) with a space and collapses whitespace — this is what lets "N° Bac" and "WILAYA_FR"-style headers hit the same alias key regardless of punctuation.
  - `BUILTIN_CANONICAL_ALIASES`: normalized-header → one of the 6 canonical fields (`exam_no`, `name_fr`, `name_ar`, `serie`, `moyenne`, `decision`), covering every real header across all 9 historical fixtures + future-minimal.
  - `IGNORED_HEADER_ALIASES`: normalized-header → a semantic category (`nni`, `birth_date`, `birth_place`, `wilaya`, `school`, `exam_center`, `registration_no`, `candidature_type`, `rejection_reason`) for every NNI/birth/school/wilaya/registration column across the fixtures — these are reported as `ignored`, kept fully distinct from `unrecognized` (a header nothing in either dictionary knows about).
  - `build_alias_dictionary(learned_aliases)`: merges `column_aliases`-sourced learned aliases (passed in as a plain `{raw_header: canonical_field}` dict — worker/mapping.py does no DB I/O itself, per architecture.md's worker boundary and code-standards.md's pure-function rule) over the builtin dictionary; learned aliases win on conflict and are normalized the same way as builtin headers.
  - `MappingAnalysis`: `mapping` (header→field), `ignored`, `unrecognized`, `missing_required` (`["exam_no"]` and/or `["name"]` — never both name_fr and name_ar required, just one), `passes_floor` property.
  - Field availability comes only from which canonical fields end up mapped — `analyze_headers` has no year/format parameter at all, so it cannot special-case by year.
  - `banned_pii_headers(headers)`: classifies each raw header via `IGNORED_HEADER_ALIASES` and returns the ones in the five privacy-banned categories (`nni`, `birth_date`, `birth_place`, `school`, `wilaya`) — deliberately NOT `exam_center`/`registration_no`/`candidature_type`/`rejection_reason`, which are ignored for scope reasons, not named as a privacy invariant. Used by `worker.py` (task 020) to keep the reject audit trail's raw-row copy from ever storing a banned column.
  - **Tests** (`worker/tests/test_mapping.py`, 47 new, 77 total in worker): every one of the 9 historical fixtures + future-minimal auto-maps its exact expected `{header: field}` mapping (read via real `pandas.read_excel(dtype=str)`, not synthetic headers); every fixture's ignored columns are asserted as a set and asserted to produce zero `unrecognized`; every fixture passes the floor; floor-violation cases (missing exam_no, missing all names, missing both) name the exact missing field(s); a name-only-in-Arabic file still passes the floor; a genuinely unknown header is reported unrecognized; learned-alias tests cover mapping an unknown header, overriding a builtin guess, and matching despite different casing/accents; `normalize_header` unit tests for the accent/punctuation cases; `banned_pii_headers` flags exactly the five privacy categories and leaves everything else (canonical fields, unrecognized headers, the four non-privacy ignored categories) alone.
  - `pytest` (77/77), `ruff check .`, `black --check .` all clean.
  - **Deliberately out of scope (per task spec):** no persistence wiring (020), no preview endpoint (018), no birth/nni handling of any kind (they're recognized-and-dropped, never parsed).

- **Task 017 — Decision Normalization & Numeric Coercion Module**
  - Renamed from this project's original "Cleaning & Normalization Module" title: there is no date parsing anywhere in this module (or anywhere in the project — no birth dates are stored), so a title implying date-cleaning logic would misdescribe what's actually here.
  - `worker/cleaning.py`: pure, DB-free module (no I/O) — `clean_dataframe(df, mapping, exam_year)` is the entry point, consuming exactly the `header -> canonical field` shape `mapping.analyze_headers(...).mapping` produces.
  - Because `mapping` only ever contains the 6 canonical fields, NNI/birth_date/birth_place/wilaya/school columns are dropped structurally (never looked up) rather than by any explicit skip logic — no birth/NNI parsing code exists anywhere in this module.
  - `normalize_decision`/`DECISION_ALIASES`: every observed historical raw string (see fixtures README) folds via accent/case-insensitive NFKD normalization to one of the 6 fixed enum values (`Admis`, `Ajourné`, `Sessionnaire`, `Absent`, `Délibérable`, `Annulé`); a trailing "Sn" session-suffix (`Admis Sn`, `Ajourné Sn`, `Delibérable Sn`) doesn't change the base decision; `Examen annulé CT (...)` matches by prefix so any bracketed reason still normalizes to `Annulé`. Also covers real-file variants found later: `إلغاء الامتحان` (Arabic "cancellation of the exam" — folds to the same key as `Annulé` once `_fold`'s NFKD decomposition strips the hamza-below mark), `Admis(e)`/`Absent(e)` (the same French gendered-suffix pattern already handled for `Ajourné(e)`), and `Annulation de l'examen` (a reversed phrasing of the `Examen annulé CT` prefix, in both straight- and curly-apostrophe spellings — `_fold` normalizes curly `'` to straight). An unrecognized variant returns `None` and the row is rejected — never silently passed.
  - `exam_no`: validated as a `\d{1,15}` digit string (a named, sane bound — not hardcoded to 5) via `_EXAM_NO_PATTERN`; stays a Python `str` throughout, so leading zeros survive.
  - `serie`: trimmed + uppercased only (fixes 2020's inconsistent raw casing like `sn`/`Lo`); never validated against a fixed set, so real typos (`SNE`, `ME`, `LME`) pass through verbatim per architecture.md.
  - `moyenne`: blank is valid (`None`, e.g. Annulé/Absent rows); present-but-unparseable or outside `[0, 20]` is rejected as an impossible value.
  - Row classification: `CleaningResult{rows: list[CleanRow], rejects: list[RejectedRow]}`; `RejectedRow{row_number, reason, column}` matches error-handling.md's worker reject shape; `.counts` gives `{importable, rejected}`. A row needs exam_no + at least one name + serie + a recognized decision to be importable; moyenne is optional but validated when present.
  - **Tests** (`worker/tests/test_cleaning.py`, 46 new, 123 total in worker): every known decision variant (incl. typos, the `Sn` suffix, and the later real-file additions above) parametrized; leading-zero preservation and non-hardcoded exam_no length bound; every required-field-missing case named by its exact `column`; unrecognized decision and out-of-range/non-numeric moyenne rejected; blank moyenne valid; SERIE casing normalized while typos pass through; every historical fixture (`2024`-`2015`) runs end to end through `analyze_headers` + `clean_dataframe` with zero birth/NNI leakage (checked structurally via `hasattr` on `CleanRow` and via a full-fixture sweep); `future_minimal` (no serie/decision columns at all) rejects every row citing `serie`, without crashing; determinism proven by running the same fixture through `clean_dataframe` twice and asserting equal `CleaningResult`s.
  - `pytest` (123/123), `ruff check .`, `black --check .` all clean.
  - **Deliberately out of scope (per task spec):** no database writes (020), no identity/linking of any kind (removed from the project).

- **Task 014 — Excel Upload API**
  - `shared/src/imports.ts`: `ImportUploadResult` (`{ importId }`), `ImportUploadResponse` — shared types for the upload response.
  - `api/src/services/imports.ts`: `sniffExcelType(bytes)` — pure content-sniffing by binary signature (zip/OOXML → `xlsx`, OLE2 compound file → `xls`; anything else, including a renamed executable, → `null`); never trusts the claimed extension or MIME type. `MAX_UPLOAD_BYTES` (25 MB) constant. `saveUploadedFile(uploadsDir, buffer, type)` writes the file under a generated `randomUUID()` name (never the original filename) to the shared uploads volume. `createImport(db, params)` inserts the initial `imports` row (`status` defaults to `'pending'` per the schema) and returns its id.
  - `api/src/routes/imports.ts`: `POST /api/imports`, session-protected via `requireSession` on the whole router. Parses `multipart/form-data` with `parseBody({ all: true })` so a second `file` field collapses into an array (needed to detect the multi-file case — without `all: true`, Hono silently keeps only the last value). Order of checks: missing/multiple file → 400, oversized → 413, content-sniff mismatch → 415, then save + create → 201 `{ data: { importId } }`. Relies on `app.ts`'s existing `STATUS_TO_CODE` map for 400/413/415, no explicit `cause` needed.
  - `UPLOADS_DIR` env var added (optional; defaults to the repo-root `uploads/` folder, resolved from `api/` as cwd) — documented in `.env.example` and `deployment.md`.
  - `app.ts`: mounted `importsRouter` at `/api/imports`.
  - 13 new tests in `api/src/__tests__/imports.test.ts` (91 total in api, excluding the pre-existing Postgres-dependent schema integration suite): 401 without session; valid `.xlsx` → 201 with `importId`; valid legacy `.xls` → 201; missing file → 400; two files in one request → 400; renamed-executable (`MZ` header, `.xlsx` extension, spreadsheet MIME type) → 415; oversized (25 MB + 1 byte) → 413; `sniffExcelType` unit tests (xlsx/xls/garbage/short-buffer); `saveUploadedFile` unit test with `node:fs/promises` mocked at the edge; `createImport` unit test with a mocked Drizzle insert chain. Route tests mock only the disk/DB edges (`saveUploadedFile`, `createImport`) and exercise the real `sniffExcelType`.
  - `tsc --noEmit` clean for api, shared, and web; `vitest run` passes (only the pre-existing Postgres-dependent `schema.test.ts` suite fails locally, because Postgres isn't running — same known infra gap noted after task 003/013b, unrelated to this change).
  - **Deliberately out of scope (per task spec):** preview, mapping, and confirm (015–018) are not implemented. The existing `web/app/admin/[lang]/(shell)/imports/upload/page.tsx` stub still posts to `/api/admin/imports/upload` (a relative Next.js path) rather than the API's actual `POST /api/imports` — left untouched since task 014 is API-only scope per `ai-workflow-rules.md`; see Open Questions below.

  Note (this batch): `routes/imports.ts` and `shared/src/imports.ts` grow
  additively in the commits below (each adds its own task's routes/types) —
  see the router-wiring note in later entries.

- **Task 018 — Mapping Preview (API + Admin UI)**
  - `worker/preview.py`: new CLI (`--file-path`, `--learned-aliases`) — the single place that turns an uploaded file into a preview payload. Reads only the header row plus `SAMPLE_ROW_COUNT = 5` data rows via `pd.read_excel(path, dtype=str, nrows=SAMPLE_ROW_COUNT)` (never the full file), then delegates entirely to `mapping.analyze_headers` (016) for column recognition — preview.py adds only file I/O and per-column sample extraction (capped at 3 values/column), never a second mapping implementation. Prints `{ok, columns: [{header, canonicalField, status, ignoredCategory, samples}], missingRequired}` on success; `{ok: false, code: "VALIDATION_ERROR" | "UNREADABLE_FILE", reason}` on failure — same stdout-JSON contract as `worker.py`.
  - `worker/tests/test_preview.py` (28 new, 151 total in worker): proves the row cap via a mocked `pd.read_excel` spy asserting `nrows=SAMPLE_ROW_COUNT`, and via a real generated 50,000-row workbook; every historical fixture (2024→2015, future_minimal) previews with zero `unrecognized` and the correct exam_no/name mapping; 2024's NNI/DATN/LIEUN are reported `ignored` with the right category (not `unrecognized`); 2022 (no NNI, has birth data) contrasts correctly; leading zeros survive into samples (2022's `Num Bac`); floor violations (missing exam_no / missing every name) reported via synthetic temp files (fixtures themselves never violate the floor, by design); learned-alias override; full CLI contract (malformed/non-object `--learned-aliases`, unreadable file, missing required arg).
  - `api/src/lib/pythonRunner.ts`: `runPythonScript(pythonBin, scriptPath, args)` — spawns via `execFile` with an argv array (never a shell string, so a DB-sourced file path can't be interpreted as shell syntax); a script's own reported `{ok: false}` failure still exits non-zero but has stdout, so only a truly broken invocation (missing interpreter/script) rejects.
  - `api/src/services/preview.ts`: `previewImport(db, importId)` — looks up the import's `filePath`, loads `column_aliases` into a plain dict (`getLearnedAliases`), spawns `worker/preview.py`, and returns the parsed payload; returns `null` for an unknown import id (framework-free, matching `studentPage.ts`'s pattern — the route throws the 404); throws a plain `Error` on a Python-reported failure (unexpected, caught by the central handler → 500 `INTERNAL`, never leaks the reason to the client). New env vars `PYTHON_BIN` (default `python3`) and `WORKER_DIR` (default repo-root `worker/`, same convention as `UPLOADS_DIR`) — documented in `.env.example` and `deployment.md`, including a gotcha note that production's api container/host will need a Python interpreter with worker/'s deps once task 029 defines the container topology.
  - `api/src/routes/imports.ts`: `GET /:id/preview` added to the existing (already session-protected) imports router; Zod-validated positive-integer `id`; 404 `IMPORT_NOT_FOUND` for an unknown import.
  - `shared/src/imports.ts`: `CanonicalField` (the 6 stored fields), `MissingRequiredField` (`'exam_no' | 'name'`), `ImportPreviewColumn`, `ImportPreviewResult`, `ImportPreviewResponse` — consumed by both api and web.
  - `api/src/__tests__/preview.test.ts` (14 new, api total 76 passing excluding the pre-existing Postgres-dependent suite): route contract with `previewImport` mocked at the boundary (401, 200 shape, ignored/unrecognized reporting, floor violation surfaced via 200 + `missingRequired` rather than an error, 404 unknown id, 400 invalid/negative id, 500 on a Python-reported failure without leaking the reason) — **plus** a second describe block that uses `vi.importActual` to run the real `previewImport` against real fixture files (2024, 2022, future_minimal) through a real spawned Python subprocess (proving the API genuinely delegates to worker/preview.py rather than reimplementing it), asserts NNI/birth-date/birth-place ignored-category reporting, and proves a learned alias overrides "unrecognized". `PYTHON_BIN` is pointed at `worker/.venv/bin/python` when present so the suite doesn't depend on the system Python having pandas.
  - **Admin UI — mapping page rewritten** (`imports/[importId]/mapping/page.tsx`) from the task-014-era mock to fetch the real preview on mount (loading/not-found/error states, retry), render each column's samples and a per-row `<select>` remap control (6 canonical fields + "— Ignore —", pre-filled from the server's guess but editable for *every* column including ones the server already ignored or left unrecognized), and label every `status: 'ignored'` column "Ignored — not stored" (with an eye-off icon) so the privacy behavior (NNI/birth date/birth place are never stored) is visible regardless of category. The floor-violation banner is recomputed client-side from the live remap state on every change (mirrors `worker/mapping.py`'s two-line exam_no/name check for instant feedback; the confirm endpoint remains the enforced source of truth). **The exam-year selector moved here from the upload page** (resolves the open question below) since the task spec requires the admin to set the year alongside the mapping; confirm is disabled until the floor is satisfied *and* a year is chosen. Confirm POSTs `{mapping, examYear}` to `/api/imports/:id/confirm` — task 019's contract per testing.md — which doesn't exist server-side yet (same forward-wiring pattern task 014 used for the upload endpoint before it existed); a failed POST shows an inline retry-able error, never a dead end.
  - **Admin UI — upload page simplified** (`imports/upload/page.tsx`): dropped the year field and the `/api/admin/imports/upload` stub; now `POST`s the real `${NEXT_PUBLIC_API_URL}/api/imports` with a raw (non-`apiRequest`) `fetch` — multipart bodies need the browser's own boundary header, which `lib/api.ts`'s `apiRequest` would override with `Content-Type: application/json`.
  - Incidental fix: the year `<Select>` (now on the mapping page) was passing `value={year || undefined}`, which Base UI flagged at runtime ("changing the uncontrolled value state of Select to be controlled") — only surfaced once the mapping page test actually exercised it. Fixed by keeping it controlled from first render (`value={year}`, `year` defaults to `''`).
  - i18n: `admin.mapping` gained `targetAriaLabel`, `missingExamNo`/`missingName`, `floorOk`, `ignoredNotStored`, `ignoreOption`, the 6 `field*` labels, `yearLabel`/`yearPlaceholder` (moved from `admin.upload`), `loading`/`loadError`/`notFound`/`confirmError`; `admin.upload` lost the year keys and gained `errorUpload`. FR/AR parity preserved (admin UI stays English under the `fr` locale key per the existing design decision; `ar.json` keeps genuine Arabic).
  - **Web tests** (`mapping/__tests__/page.test.tsx`, 5 new): columns/samples render with NNI shown as "Ignored — not stored"; axe-clean once loaded; confirm blocked while the floor is violated and clears once remapped back (with no year selected, confirm stays disabled even at zero violations); remapping an unrecognized column and selecting a year produces the exact confirm payload (`{mapping: {NODOSS: 'exam_no', NOMPL: 'name_fr', REGION_ADMIN: 'serie'}, examYear}`).
  - `tsc --noEmit` clean for api/shared/web; `next build` clean; `eslint` introduces zero new errors (verified file-by-file against the pre-existing ~77-error baseline — the rewritten upload/mapping pages actually net fewer total errors than before, since the old task-014 mock code they replaced had its own share of the baseline).
  - **Deliberately out of scope (per task spec):** the `POST /api/imports/:id/confirm` endpoint itself, BullMQ enqueueing, and learned-alias persistence are task 019.

  Note (this batch): commits above split this single task-018 entry across
  three commits (worker preview.py, api preview service + router, this web
  UI) since each is a cleanly separable file — this entry is recorded once
  here, at the last of the three.

- **Task 019 — Job Queue, Confirm & Status**
  - `api/src/lib/queue.ts`: BullMQ `Queue<ImportJobData>` (`IMPORT_QUEUE_NAME = 'import'`), `IMPORT_JOB_ATTEMPTS = 3` with exponential backoff (`IMPORT_JOB_BACKOFF_MS`) per error-handling.md's "max 2 retries" (3 = 1 initial + 2 retries). The Redis connection is passed as plain `{host, port, username, password}` options rather than a shared `ioredis.Redis` instance — BullMQ bundles its own pinned `ioredis` (`5.10.1` exact vs. the app's `^5.11.1`), which TypeScript treats as an incompatible nominal type; plain options sidestep it entirely (documented in deployment.md's gotchas).
  - `api/src/schemas/confirm.ts`: `confirmImportBodySchema` — `mapping` (non-empty `Record<header, CanonicalField>`, Zod enum'd to the 6 stored fields) + `examYear` (1900-2100).
  - `api/src/services/confirm.ts`: `confirmImport(db, queue, importId, payload)` — validates the guaranteed floor (exam_no + at least one name) against the *submitted* mapping's values directly (mirrors `worker/mapping.py`'s `passes_floor`, no need to re-spawn Python at confirm time since the mapping UI only lets the admin remap real headers a preview already showed them); throws `MissingRequiredColumnsError` on violation (route → 422 `MISSING_REQUIRED_COLUMNS`). Persists every submitted header → field pair to `column_aliases` (upsert via `onConflictDoUpdate`) so the next preview of the same headers auto-maps them. Enqueues exactly one job via an atomic conditional UPDATE (`WHERE id = ? AND status = 'pending'`, `RETURNING`) — only the confirm call that actually flips pending → processing enqueues; a duplicate confirm (double-click, retry, race) sees zero rows returned and reports the import's current status without touching the queue. `jobId: 'import-{id}'` on the BullMQ job is a second, redundant safety net (BullMQ itself won't duplicate an existing job id).
  - `api/src/services/importStatus.ts`: `getImportStatus(db, importId)` — maps the imports row to `{status, examYear, progress, summary, smokePassed, published, failureReason}`; `summary` is `null` until the job has actually produced one (distinguishes "hasn't run yet" from "ran with 0 inserted").
  - `api/src/services/importJob.ts`: `runImportJob(db, data)` — the testable core the queue worker runs per BullMQ attempt. Marks the row `processing`/`progress: 0`, spawns `worker/worker.py` via the existing `runPythonScript` (task 018), and on `{ok: true}` marks `completed` with the summary. On `{ok: false, code, reason}` throws `ImportJobError(code, reason)` so BullMQ retries; the reason (not a generic message) is what eventually lands in `failureReason`. Also runs the automated smoke verification at the end of a successful completion (022) and reports finer-grained progress (020) as the loader provides it. **Decision**: `--file-id` is passed the import's numeric id, not its file path — per architecture.md, `worker/worker.py` (task 020) owns loading into Postgres directly and is expected to resolve the file path itself from the `imports` row, keeping the Node side a thin argument-forwarder rather than a second place that knows how to locate the file.
  - `api/src/queueWorker.ts`: the actual Node-side queue worker process (new entry point, `npm run queue:worker`, mirrors `app.ts`/`server.ts`'s thin-entry-point split so `importJob.ts`'s logic stays unit-testable without a real Redis connection). `Worker<ImportJobData>` at concurrency 1. Its `failed` handler only calls `markImportFailed` once `job.attemptsMade` reaches the configured `attempts` limit — BullMQ fires `failed` after every attempt, including ones that still have retries queued, so an early check would mark the import failed prematurely mid-retry.
  - `api/src/routes/imports.ts`: `POST /:id/confirm` (202 on success/no-op-duplicate, 404 `IMPORT_NOT_FOUND`, 422 `MISSING_REQUIRED_COLUMNS`, 400 `VALIDATION_ERROR` for a malformed mapping/payload or out-of-range year) and `GET /:id/status` (200 with the full lifecycle payload, 404 for an unknown id) added to the existing session-protected imports router.
  - `shared/src/imports.ts`: `ImportConfirmPayload`/`ImportConfirmResult`/`ImportConfirmResponse`, `ImportStatus`, `ImportSummary`, `ImportStatusResult`/`ImportStatusResponse`.
  - Root `package.json`'s `dev` script now runs three processes (`web`, `api`, `queue`) via `concurrently` — without the worker process, a confirmed import would sit in `processing` forever in local dev, since nothing drains the queue.
  - **Tests** (41 new, 120 total in api, all passing): `confirm.test.ts` — route contract (401/202/404/422/400×4) with the service mocked at the boundary, plus a service-level suite using `vi.importActual` against a small stateful fake `imports`/`column_aliases` table proving single-enqueue-per-confirm, duplicate-confirm safety (second call enqueues nothing and reports the real current status), alias persistence, unknown-id handling, and both floor-violation cases (missing exam_no, missing every name). `importJob.test.ts` — `runImportJob`'s processing→completed transition with the exact argv passed to `runPythonScript`, the `{ok:false}` → `ImportJobError` path (only the "processing" update happens, never "completed"), a truly broken invocation propagating as a plain rejection, and `markImportFailed`. `importStatus.test.ts` — route contract + service mapping (completed-with-summary, pending-with-null-summary, unknown id).
  - **Incidental fix, made permanent**: `api/drizzle/meta/_journal.json`'s migration `when` timestamps were already non-monotonic and drizzle-orm's migrator silently no-ops any migration whose `when` isn't greater than `MAX(created_at)` already recorded — it never checks hashes. Rather than hand-patch entries, added `api/scripts/check-migration-journal.ts` (`npm run db:check-journal`, wired into `db:generate`; `npm run db:fix-journal` to repair) which verifies/clamps the whole journal to strictly increasing and keeps `drizzle.__drizzle_migrations` in sync by hash — see deployment.md's gotchas.
  - `tsc --noEmit` clean for api/shared; `eslint` introduces zero new errors on every file touched; `vitest run` 120/120.
  - **Deliberately out of scope (per task spec)**: the actual loading logic inside Python (020) — `worker/worker.py` remains a stub. Finer-grained progress reporting (beyond 0/100) and Sentry integration for unexpected queue-worker errors are not part of this task (Sentry isn't wired into any part of this codebase yet).

  Note (this batch): `smokeVerification.ts` (022's design, but triggered
  from `importJob.ts` itself rather than from the publish route) lands here
  too, since `runSmokeVerification` is a genuine runtime dependency of
  `runImportJob` — publish (022 below) only reads the `smokePassed` flag
  this sets. `importJob.ts`'s finer progress reporting (020) ships in this
  same file's final form here as well, since it exists as one file.

- **Task 020 — The Loader (Python -> Postgres)**
  - `worker/loader.py`: new module, the only place in `worker/` that talks
    to Postgres (code-standards.md: "raw SQL allowed only in the Python
    loader and migrations"). `check_mapping_floor(mapping)` re-validates the
    guaranteed floor directly on the CONFIRMED header->field mapping the job
    was enqueued with (mirrors `confirm.ts`'s `checkFloor`) — a defensive
    last check so a broken mapping fails the whole file with one precise
    `MISSING_REQUIRED_COLUMNS` reason instead of silently rejecting every
    row. `load_import(dsn, import_id, exam_year, rows, rejects,
    raw_rows_by_number)` runs inside one `with psycopg.connect(...) as conn`
    block (commits on clean exit, rolls back on any exception — the
    single-transaction guarantee error-handling.md requires): deletes any
    rejects left over from a PRIOR run of the SAME import id (keeps the
    reject report a true reflection of the latest run, not an ever-growing
    log), then batch-inserts rejects and attempts (`BATCH_SIZE = 1000` rows
    per statement, well within the <2-minute/50k-row budget). Attempts use
    `ON CONFLICT (exam_year, exam_no) DO NOTHING RETURNING id`, counting
    `duplicates_skipped = len(rows) - inserted` — architecture.md invariant
    5's idempotency, achieved via the DB constraint, not application logic.
    `public_slug` is never set by the loader; the DB-side `DEFAULT` self-
    populates it. `resolve_file_path(dsn, import_id)` looks up
    `imports.file_path`, matching task 019's established contract that
    `worker.py` (not the api) resolves the file from the import id.
  - Every reject's raw row is filtered through `mapping.banned_pii_headers`
    (016) before it's ever kept for the audit trail, and every value passed
    through a small `_json_safe` sanitizer (`math.isfinite` check → `None`)
    right before wrapping in psycopg3's `Jsonb` — a genuinely blank Excel
    cell survives as Python float `nan` even in a `dtype=str` column, and
    `Jsonb`'s underlying `json.dumps` would otherwise emit the non-standard
    `NaN` token, which Postgres's strict `jsonb` column rejects outright.
  - `worker/worker.py` rewritten from the task-015 stub to the real
    pipeline: `validate()` now also requires `--file-id` to parse as a
    positive integer (it's genuinely the import id, per task 019's
    `importJob.ts` comment — the flag name itself was kept as `--file-id`
    to avoid an unnecessary rename of an already-established CLI contract).
    `run_import(dsn, import_id, exam_year, mapping)` orchestrates
    resolve-path -> floor-check -> `pd.read_excel(dtype=str)` (whole file,
    unlike preview.py's sampled read) -> `cleaning.clean_dataframe` ->
    `loader.load_import`, returning a precise `{code, reason}` for every
    file-level failure (`IMPORT_NOT_FOUND`, `MISSING_REQUIRED_COLUMNS`,
    `UNREADABLE_FILE`) — row-level problems never surface here, only as
    counted rejects. `main()` wraps everything so an unexpected exception
    still emits the standard `{ok: false, code: "INTERNAL", reason}` JSON
    contract instead of a raw traceback. Success now prints the REAL
    `{ok: true, inserted, rejected, duplicates_skipped}`. `report_progress`
    pings `imports.progress` on its own autocommit connection (deliberately
    separate from `load_import`'s single load transaction, so interim
    updates are visible to other connections — e.g. the API's status
    endpoint — before the whole load commits); `worker.py` reports 10%
    after reading the file and 20% after cleaning, `loader.load_import`
    reports 20-95% itself as reject/attempt batches complete.
  - New dependencies (landed early in `requirements.txt`/`requirements-dev.txt`,
    task 015's commit, for this batch's reconstruction): `psycopg[binary]`
    (loader's only DB driver), `xlrd` (legacy `.xls` support — real
    historical files `bac_2017`/`bac_2020` are OLE2 binary, not OOXML; the
    api's upload route already sniffed and accepted them, but pandas raised
    `ImportError: Missing optional dependency 'xlrd'` without it), and
    `python-dotenv` (test-only, loads `DATABASE_URL` for pytest).
  - `cleaning.DECISION_ALIASES` (017) also picked up three real-file
    variants found against actual historical uploads: `Admis(e)`/`Absent(e)`
    (the same gendered-suffix pattern already handled for `Ajourné(e)`) and
    `Annulation de l'examen` (a reversed phrasing of `Examen annulé CT`, in
    both straight- and curly-apostrophe spellings) — all already reflected
    in task 017's entry above since `cleaning.py` is one file.
  - **Tests** (60 new, 179 total in worker, all against a real disposable
    local Postgres — testing.md's "Loader tests against a disposable
    Postgres"): `worker/tests/conftest.py` adds `dsn` (skips if
    `DATABASE_URL` unset), an autouse `TRUNCATE`-before-and-after fixture
    scoped to `imports`/`attempts`/`rejects`, and `make_import` (inserts a
    disposable `imports` row pointing at a real fixture file).
    `test_loader.py`: floor-check cases; inserting rows with the public_slug
    default intact; rejects recorded with row_number/reason/raw_data and
    excluding banned PII columns; re-running the SAME import id is
    idempotent on attempts (0 inserted, all duplicates on the 2nd run) and
    replaces (never duplicates) its rejects; a genuinely different import
    conflicting on (exam_year, exam_no) counts as a duplicate too; a
    mid-load failure leaves the attempts table at zero rows for that import
    — full rollback; a synthetic NaN-in-raw_data case proving the loader
    stores JSON `null` instead of crashing on the non-standard `NaN` token;
    a second-connection read proving `imports.progress` is genuinely visible
    mid-load, not just invisible-until-commit.
    `test_worker_cli.py` rewritten: argument-validation tests updated to a
    numeric placeholder file-id plus new non-numeric/non-positive file-id
    cases; file-level failure tests for unknown import id, floor-violating
    mapping, and an unreadable file path; and a parametrized test across ALL
    10 fixtures (2024 down to 2015, plus future_minimal) that computes each
    fixture's expected inserted/rejected counts via `clean_dataframe` as an
    independent oracle, then asserts the real `worker.main()` + Postgres
    end-to-end run matches exactly; plus a same-import-twice run proving
    `duplicates_skipped` equals the first run's `inserted` count.
  - `pytest` 189/189, `ruff check .`, `black --check .` all clean.
  - **Deliberately out of scope (per task spec):** any linking (already
    removed from the project); the publish flow and Meilisearch reindex
    wiring (both task 022); the reject-report download endpoint is a
    separate api-side commit below (rejects.ts), since it's a standalone
    file.

- **Task 020 (api side) — Reject Report Download Endpoint**
  - `api/src/services/rejects.ts` (new) + `GET /api/imports/:id/rejects`
    added to the existing session-protected imports router. `getRejectReport`
    returns `null` for an unknown import id (route -> 404
    `IMPORT_NOT_FOUND`); an empty array is a valid "real import, zero
    rejects" result. `toRejectReportCsv` flattens each reject's raw row into
    a single JSON field rather than a fixed per-column CSV schema, since the
    stored columns vary by historical file format (architecture.md's
    "never trust the file's schema" applies here too). Response headers:
    `text/csv`, `Content-Disposition: attachment`, `Cache-Control: no-store`.
  - **Tests** (8 new): route contract (401, 200 with the exact CSV body
    incl. a header-only CSV for zero rejects, 404 unknown id, 400
    non-numeric id) with the service mocked at the boundary; a pure
    `toRejectReportCsv` quoting test (comma + embedded double-quote in a
    reason); two service-level tests proving an unknown import id
    short-circuits before ever querying `rejects`, and the row-shape mapping
    for a known one.

- **Task 022 — Publish Flow & Cloudflare Purge**
  - **Schema**: no migration needed — `imports.smokePassed`/`imports.published`
    already existed, and every public read path (`studentPage`, `examSearch`,
    `meiliIndex`) already filtered on `imports.published = true`. This task's
    job was the write side: gating on the smoke result (019/020), then
    flipping the flag and refreshing every derived system.
  - `api/src/services/publish.ts` (new): `publishImport`/`unpublishImport`.
    Publish re-checks `smoke_passed = true` in the UPDATE's WHERE clause
    (not just in an earlier read) so a concurrent smoke re-run can't race a
    stale publish call into flipping visibility anyway; throws
    `SmokeNotPassedError` (route → 409 `SMOKE_NOT_PASSED`, added to
    error-handling.md's canonical codes) when blocked. On success (and on
    every unpublish, unconditionally — reverting must always be possible):
    full Meilisearch reindex (`buildNameIndex`), Redis invalidation for
    every attempt in the import (`examCacheKey`/`resultCacheKey` exported
    from their services so `publish.ts` can reuse the exact key format;
    batched via `redis.pipeline()`) plus the years-list cache, and the
    Cloudflare purge hook.
  - `api/src/lib/cloudflare.ts` (new): `purgeCloudflareCache()` — purge-
    everything, silently a no-op when `CLOUDFLARE_API_TOKEN`/
    `CLOUDFLARE_ZONE_ID` aren't set (true in local/dev, no real zone
    provisioned yet).
  - `api/src/routes/imports.ts`: `POST /:id/publish` and `POST
    /:id/unpublish` added to the growing session-protected imports router.
  - `shared/src/imports.ts`: `ImportPublishResult`/`ImportPublishResponse`.
  - `getAdminResultPreview` (the auth-gated, unpublished-data-visible
    sibling to the public result lookup) already lives on `studentPage.ts`
    from the retrofit commit — it's what both this task's smoke check (019)
    and the admin preview route (`GET /api/results/:slug/admin`) call; nothing
    new needed here.
  - **Tests** (24 new): `publish.test.ts` (14: route contract incl. 409
    `SMOKE_NOT_PASSED` and 404, plus service-level tests against fake
    db/meili/redis chains proving the atomic conditional flip, cache
    pipeline keys, and reindex), `cloudflare.test.ts` (3: no-op when
    unconfigured, purges when configured, throws on a non-OK response).
  - **Admin UI**: new page `imports/[importId]/page.tsx` — fetches `GET
    /api/imports/:id/status` once (loading/notFound/error states matching
    the mapping page's pattern, plus a manual refresh button since live
    polling while processing is task 024's job, not this one's), renders
    year/status/progress/summary/smoke/published via the shared
    `PropertyRow` component, and shows Publish (disabled with an inline
    note until `smokePassed === true`) or Unpublish (once published) — one
    reversible click, no confirmation dialog. **Deliberately not wired from
    the imports LIST page**: that page still renders `MOCK_IMPORTS` and
    task 024 explicitly owns linking to this page from there.
  - **Tests** (`imports/[importId]/__tests__/page.test.tsx`, 7 new): loaded
    state, axe-clean, not-found, publish enabled/disabled on smoke result,
    unpublish shown once published, no controls before completion.
  - i18n: new `admin.publish` block (pageTitle, statuses, publish/unpublish
    buttons, smoke-blocked note, error copy). FR/AR parity preserved.
  - **Deliberately out of scope (per task spec)**: rate limiting (025);
    wiring the imports LIST page off `MOCK_IMPORTS` and linking to this
    page from there (024).

- **Task 024 (api side) — Imports Dashboard Listing Endpoint**
  - `GET /api/imports` (session-protected, added to the existing `imports`
    router as the final route — the admin's single view of every uploaded
    file). `api/src/services/importList.ts`: `listImports(db)` selects
    every `imports` row ordered newest-created-first and maps it to the
    same lifecycle shape `getImportStatus` already exposes per-import
    (`status`, `progress`, `summary`, `smokePassed`, `published`,
    `failureReason`), plus `id`/`originalFilename`/`createdAt` for the list
    view. `shared/src/imports.ts`: `ImportListItem`/`ImportListResponse` —
    the last addition to this file, which now carries every task's
    upload/preview/confirm/status/publish/list types in one place.
  - **Tests** (5 new, api total 165/165): 401 without a session, empty
    array, full-lifecycle shape via the mocked service, and a service-level
    test against a fake `select().from().orderBy()` chain proving the row
    mapping and that ordering is actually requested.

- **Task 024 (web side) — Imports Dashboard UI**
  - **Admin UI — imports LIST page rewritten** (`imports/page.tsx`) from a
    server component rendering `MOCK_IMPORTS` to a client component that
    fetches `GET /api/imports` on mount with `loading`/`loaded`/`error`
    states and an honest empty state. **Live progress while processing**: a
    second effect polls the same endpoint every 3s only while at least one
    row is `processing`, and stops itself once nothing is in flight — no
    push channel exists, and polling is an explicitly acceptable choice for
    this scale. Each row is an entry point into the rest of the admin
    journey: `pending` rows link to the mapping page; every other status
    links to the publish/detail page (022); any row with a `summary` gets a
    reject-report download link pointing at the real
    `GET /api/imports/:id/rejects`.
  - `web/components/admin/ImportStatusBadge.tsx` simplified from an invented
    6-state enum (`pending/mapped/confirmed/processing/done/failed` — none
    of which but `pending`/`processing`/`failed` ever existed in the DB) to
    the real 4-value `ImportStatus` from `shared` (`pending`, `processing`,
    `completed`, `failed`). There is no `mapped`/`confirmed` status
    server-side: an import is `pending` from upload until confirm
    atomically flips it straight to `processing`.
  - i18n: dropped `admin.imports.statusMapped`/`statusConfirmed`/
    `statusDone`/`summaryNewPeople`; added `statusCompleted`, `viewDetails`,
    `loading`, `loadError`. FR/AR parity preserved.
  - **Tests** (9 new, web total 28/28): every lifecycle state renders from
    the real `ImportListItem` shape, axe-clean, empty state with a working
    upload entry point, loading state, retryable error state, reject-
    download link present exactly when an import has a summary, pending →
    mapping link vs. other statuses → detail link, and a fake-timers test
    proving the poll actually re-fetches and the progress bar/percentage
    update without a manual refresh.
  - **Deliberately out of scope (per task spec)**: any new pipeline
    behavior — this task is presentation and wiring only; rate limiting
    (025).

- **Design Docs & Tokens Sync — globals.css, DESIGN.md v2.0, PRODUCT.md**
  - **`globals.css`** — dark mode flattened to match light (`--card`/`--popover` = `--background`); removed dead `.shadow-level-1` utility and the unused `netija-confetti` keyframes + reduced-motion rule (nothing rendered confetti).
  - **Admin login** — last `shadow-level-1`/`bg-card` consumer now a hairline-bordered `rounded-lg` block.
  - **`web/DESIGN.md`** — rewritten as v2.0 describing the flat Notion-document system as implemented: one warm canvas (no cards/shadows/pills), tag + property-row + quiet-button component vocabulary, real type ramp (`clamp` heading, mono numerals, zero-padded moyenne), elevation only on floating menus, celebration = tag spring + count-up.
  - **`web/PRODUCT.md`** — removed stale "full attempt history across years" claim (history was cut in 013b); added design principle 6 "A document, not an app" and a "Card-and-shadow chrome" anti-reference; "decision badges" → "decision tags" in a11y section.
  - `tsc --noEmit` clean; 7/7 web tests pass; no `shadow-level-1` references remain.

- **Home/Search Redesign — same flat Notion document language as the result page**
  - **Home page** — dropped `PageShell` (component deleted, was the last consumer) for the result page's document column (`max-w-140 mx-auto px-6 pt-[9vh] pb-20`), start-aligned; h1 now uses the result page's type ramp (`clamp(1.875rem,7vw,2.5rem)`, `tracking-[-0.01em]`) with the muted subtitle under it.
  - **SearchTabs** — tabs restyled from underline-line tabs to quiet Notion switcher buttons (`h-9 rounded-md`, active = `bg-muted text-foreground`, `after:hidden` kills the line indicator); labels are muted 14px normal-weight; exam input and year select are flat hairline fields (`rounded-md bg-transparent`, mono kept on exam no); submit CTA stays solid black but `rounded-md` instead of pill; not-found block start-aligned; example hint bumped from `muted-foreground/60` to full `muted-foreground` for contrast.
  - **NameAutocomplete** — input flat like the exam field; suggestion dropdown `rounded-md bg-background` with no per-row dividers (hover/active `bg-muted` only, skeletons too); match highlight changed from salmon `text-accent` (contrast fail) to bold `text-foreground`.
  - `tsc --noEmit` clean; 7/7 web tests pass; curl-verified rendered AR/FR home pages (new h1 ramp, document column, tab classes present; no `rounded-full`/`bg-card` remnants).

- **Result Page Redesign — flat Notion-style document (from HTML mockup)**
  - **Global tokens (`globals.css`)** — `--card` and `--popover` now equal `--background` (`oklch(0.975 0.003 80)` warm paper) in light mode: the entire system sits on one flat warm-white surface; elevation is carried by hairline borders and existing shadows, not white-on-paper lift. Dark mode untouched.
  - **StudentResultCard** — rewritten to the flat mockup layout: no card wrapper, no `shadow-level-1`, no breadcrumb. Name h1 (`clamp(1.875rem,7vw,2.5rem)`), flat `PropertyRow`s for exam number (mono), year (mono), série (muted tag), and decision (Notion-style select tag tinted with the status tokens — replaces the giant colored `DecisionHero` text), then `hr`, then the moyenne as the big number (`XX.XX / 20`, zero-padded 2 decimals, count-up preserved for Admis only), and two quiet bordered actions: copy-link (clipboard + 1.5s "copied" swap) and new-search. Decision tag entrance via new `.netija-tag-spring` (Admis) / `.netija-tag-fade` CSS classes; reduced-motion collapses spring to fade.
  - **Results page** — dropped `PageShell` for a `max-w-140` centered column with `pt-[9vh] pb-20` (mockup's narrow single-column measure).
  - **Layout** — removed the header's `border-b` for the flat borderless nav.
  - **i18n** — added `student.decisionLabel` (القرار / Décision), `copyLink`, `linkCopied`, `newSearch` to both locales.
  - `tsc --noEmit` clean; 7/7 web jest tests pass; verified served HTML/CSS via curl (header borderless, `--card: #f8f6f4`, tag animation classes in bundle).

- **Harden Search Flow (NameAutocomplete + SearchTabs)**
  - `NameAutocomplete.tsx` — added `requestIdRef` for stale-response rejection, `ApiClientError` handling with server messages, retry button on error, `maxLength={100}`, `dir="auto"` on suggestion names for RTL, `break-words` for long text overflow, `aria-owns` on combobox, RTL-aware clear button positioning, liveMessage cleanup on clear, ArrowDown guard on empty list.
  - `SearchTabs.tsx` — added `submittingRef` for double-submit guard, `requestIdRef` for stale-response rejection, retry button on not-found state, `ApiClientError` message passthrough, RTL-aware clear button positioning, logical padding (`pe-10`).

- **Design System Extraction — PageShell, PropertyRow, --nav-height**
  - Extracted `--nav-height` CSS token (`3.5625rem` = 57px) from hardcoded values in layout + 2 pages
  - Created `PageShell` component: reusable page wrapper providing `min-h-[calc(100vh-var(--nav-height))]` + `mx-auto max-w-2xl` centered container, with `className`/`innerClassName` for page-specific overrides
  - Created `PropertyRow` component: reusable key-value row (icon + label + children) extracted from StudentResultCard's 3 inline uses
  - Migrated `layout.tsx`, `page.tsx`, `student/page.tsx`, and `StudentResultCard.tsx` to use the new shared implementations
  - TypeScript clean, zero remaining hardcoded nav-height references

- **Optimize Search & Result Pages**
  - **StudentResultCard** — Wrapped `DecisionBadge` and `HistoryEntry` in `React.memo` to prevent unnecessary re-renders on parent state changes; added `contain: layout style` to the result card to scope layout/paint work to the card subtree.
  - **SearchTabs** — Wrapped `handleTabChange` and `handleCancel` in `useCallback` with empty deps for stable handler identities.
  - **NameAutocomplete** — Wrapped `handleClear` and `select` in `useCallback` for stable handler identities.
  - **PropertyRow** — Wrapped export in `React.memo`.

- **Harden Search & Result Pages**
  - **StudentResultCard** — Added decision badge icons (Check/Minus/Clock) for color-blind accessibility; replaced non-functional `wrap-break-word` with `break-words hyphens-auto` on name headings; added `break-words` to history school, SeeAlso links, and PropertyRow values.
  - **SearchTabs** — Replaced RTL-hardcoded clear button (`lang === 'ar' ? 'left-1' : 'right-1'`) with logical `end-1`; added `break-words` to error messages.
  - **NameAutocomplete** — Same RTL clear button fix to `end-1`; added `break-words` to birthPlace and serie metadata spans.
  - **PropertyRow** — Added `break-words` to value container for long text protection.

## Design Decisions

- **Admin UI language is English.** The admin dashboard (`/admin/fr/...`) uses English, not French. Arabic locale (`/admin/ar/...`) stays in Arabic. This applies to: `fr.json` admin keys, hardcoded strings in admin components, field labels, aria-labels, and any future admin pages. Never add French text to the admin UI.

## Architecture Decisions

- **Worker excluded from npm workspaces**: Python package has no npm integration; adding it as a workspace would cause `tsc`/`eslint` to try to process Python files. Left as a standalone folder per the task spec.
- **`"files": []` in workspace tsconfigs**: Prevents TypeScript from erroring with "No inputs were found" on empty workspaces. Will be replaced with `"include": ["src/**/*"]` when source files are added.
- **ESLint 9 flat config**: Used `eslint.config.mjs` (ESM) to avoid `"type"` conflicts with the root `package.json`. TypeScript rules use `projectService: true` for type-aware linting.

## Session Notes

- All four root scripts (`build`, `lint`, `typecheck`, `test`) pass on a fresh install.
- `npm install` installs 120 packages (TypeScript, ESLint 9 + TS plugin, Prettier). No app dependencies yet.
- Done-when checklist for Task 001: both items satisfied — fresh install succeeds, `CLAUDE.md` exists.
