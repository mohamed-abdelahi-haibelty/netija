# Architecture Context

## Stack

| Layer            | Technology                                                   | Role                                                  |
| ---------------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| Frontend         | Next.js 16 + TypeScript                                      | Public site + admin dashboard UI                      |
| UI               | Tailwind CSS + shadcn/ui                                     | Styling and component library                         |
| Backend API      | Hono (Node.js runtime) + TypeScript                          | REST API: search, results, imports, health            |
| Auth             | Better Auth                                                  | Admin-only email/password auth; sessions              |
| Database         | PostgreSQL 16 + Drizzle ORM                                  | Source of truth: attempts, imports, aliases, rejects  |
| Cache / Queue    | Redis 7 (ioredis) + BullMQ                                   | Result cache, rate limiting, import job queue         |
| Search           | Meilisearch                                                  | Typo-tolerant name autocomplete (FR + AR)             |
| Data pipeline    | Python 3.12 + pandas + openpyxl                              | Excel reading, cleaning, loading                      |
| Analytics        | PostHog Cloud (EU, anonymous only)                           | Product analytics; no PII in events                   |
| Error monitoring | Sentry (@sentry/nextjs, @sentry/node, sentry-sdk for Python) | Capture unexpected errors everywhere                  |
| Edge             | Cloudflare (free plan)                                       | DNS, DDoS protection, bot mitigation, edge cache      |
| Reverse proxy    | Caddy                                                        | TLS termination, routes domains to services           |
| Infra            | Docker Compose on a single VPS (Ubuntu 24.04, 8 GB)          | Runs all production services                          |

## System Boundaries

- `web/` — Next.js app. Owns all UI (public + admin), SEO metadata,
  accessibility, PostHog browser events. Never talks to Postgres,
  Redis, or Meilisearch directly — only to the Hono API.
- `api/` — Hono app. Owns HTTP concerns: validation (Zod), auth
  enforcement (Better Auth), rate limiting, caching, enqueueing
  jobs, reading Postgres via Drizzle, querying Meilisearch.
  Contains no Excel-parsing logic.
- `api/src/routes/` — route definitions only (thin).
- `api/src/services/` — business logic, framework-free functions.
- `api/src/db/` — Drizzle schema, client, migrations.
- `api/src/queueWorker.ts` — a second, separate Node process (own
  entry point, run via `npm run queue:worker`, not part of the
  Hono app) that consumes the BullMQ import queue (concurrency 1)
  and spawns `worker/worker.py` as a subprocess per confirmed
  import. It never serves HTTP; it only reads job data and writes
  the import's lifecycle (status, progress, summary, failure
  reason) back to Postgres.
- `worker/` — Python pipeline. Owns Excel reading, cleaning,
  column mapping, loading Postgres, Meilisearch reindex, reject
  reports. Never serves HTTP to the public. Invoked as a subprocess
  by `api/src/queueWorker.ts`, one process per job.
- `uploads/` — shared volume between api and worker for uploaded
  Excel files.
- Root `docker-compose.yml` (local dev) and a production compose
  file (task 029) own their respective runtime topologies.
  `Caddyfile` owns routing/TLS in production.
- In Next.js 16, middleware.ts was renamed to proxy.ts

## Data Model (minimal, privacy-first)

This project deliberately stores and displays the MINIMUM personal
data: name, exam number, exam year, serie, decision, moyenne. It
does NOT store or display the NNI, birth date, or birth place, and
it does NOT link attempts into shared persons. There is no identity
resolution, no person entity, no cross-year merging, and no
"other records" / see-also feature. A "result" is a single attempt.

## Storage Model

- **PostgreSQL**:
  - `attempts` — the only result-bearing table and the source of
    truth. One immutable row per exam sitting. Columns: exam_year,
    exam_no (TEXT, leading zeros preserved), public_slug, name_fr,
    name_ar, serie (NOT NULL), decision (NOT NULL, normalized enum),
    decision_raw, moyenne (nullable numeric out of 20),
    import_id. UNIQUE (exam_year, exam_no).
    There are NO nni, birth_date, birth_place, school, wilaya, or
    match_key columns.
    - `public_slug` (TEXT, NOT NULL, UNIQUE) is the ONLY public URL
      handle: a random, unguessable string (DB default
      `replace(gen_random_uuid()::text,'-','')`) so result pages
      can't be enumerated via sequential exam numbers. It is a
      display alias only — the INTERNAL identity for import,
      uniqueness, joins, and admin remains (exam_year, exam_no).
      The DB-side default means every inserter (seed, Python loader,
      admin, manual SQL) self-populates it with no application code.
      Note: the exam-number search still resolves by (exam_year,
      exam_no); the slug removes URL enumeration, not the by-number
      lookup itself (rate limiting guards that).
  - `imports` — file metadata, status lifecycle (`pending`,
    `processing`, `cancelling`, `completed`, `cancelled`, `failed`
    — task 032 added `cancelling`/`cancelled`), summary counts,
    smoke result, the published flag per exam year, and
    `worker_pid` (the currently-running worker.py subprocess's OS
    pid, set by the queue worker and cleared when it exits) — lets
    the API process, which does NOT spawn that subprocess itself,
    signal it directly for cancellation.
  - `rejects` — per-import rejected rows with reasons (raw row kept
    for audit).
  - `column_aliases` — learned header to canonical field mappings.
  - Better Auth tables (admins, sessions).
  - There are NO `persons`, `person_links`, or `link_suggestions`
    tables.
- **Redis**: cache of result-page payloads (keyed by the attempt's
  public_slug as `result:{slug}`; TTL >= 300 s, invalidated on
  import/publish), rate-limit counters, BullMQ job state.
- **Meilisearch**: derived search index with one document PER
  PUBLISHED ATTEMPT (not per person). The document id IS the
  attempt's public_slug; the payload carries name_fr, name_ar,
  exam_year, exam_no, and serie. Rebuildable from Postgres at any
  time; never the source of truth; only published years are indexed.
- **Filesystem volume**: original uploaded Excel files (kept —
  they are the ultimate recovery source).

## Data Model Invariants (domain-critical)

- `attempts` has UNIQUE (exam_year, exam_no). Exam numbers are
  digit strings with leading zeros preserved (always TEXT, never
  numeric), validated with a sane length bound rather than a
  hardcoded exact length, and are only unique within a year.
- NEVER trust the file's schema. The only columns guaranteed in
  every year's file are the exam number and at least one name
  (French or Arabic). serie, moyenne, decision and everything else
  may be absent or differently named in any given year. Field
  availability is detected per file from the mapped columns — never
  hardcoded by year (e.g. 2022's columns differ from 2021's).
- Files may contain NNI, birth date, birth place, school, or wilaya
  columns in some years. These are IGNORED: never mapped to a stored
  field, never written to the database, never displayed. The
  pipeline drops them.
- A row imports only if it has exam_year, exam_no, at least one
  name, a serie, and a decision. Rows missing a required field are
  rejected-with-reason into `rejects` (graceful, counted) — never
  a crash. The NOT NULL constraints on serie/decision are a
  database backstop behind that validation, not the first line of
  defense.
- Decision values are normalized to a fixed enum on import:
  `Admis`, `Ajourné`, `Sessionnaire`, `Absent`, `Délibérable`,
  `Annulé`. Raw source variants (`Ajourné(e)`, `Ajourné Sn`,
  `Sessionaire`, `Abscent`, `Examen annulé CT ...`, `Admis Sn`)
  map onto these; the raw value is preserved in a `decision_raw`
  column. Unknown variants are flagged, never silently passed.
- Moyenne is stored as numeric out of 20; nullable (e.g. Annulé).
- SERIE (track: SN, LM, LO, M, TM, TS, LA, ...) is stored as text on
  the attempt; new series may appear in future years and must not
  break imports.
- Multiple attempts sharing a name are INDEPENDENT rows. The system
  never asserts they are the same person; name search simply
  returns each matching attempt as its own year-labeled result.

## Auth and Access Model

- Public routes (search, result pages, health) require no auth.
- All `/admin` UI routes and all mutating API routes
  (upload, confirm, publish, delete) require a Better Auth session.
- There is no public registration. Admin accounts are seeded or
  created via a CLI script.
- The API enforces auth server-side on every protected route;
  the frontend hiding a button is never the security boundary.

## Environments

- **Production** is the only deployed environment, running as a
  single Docker Compose project on the VPS.
- **Local dev** (Docker Compose, task 002) is where code changes
  are built and tested before they reach production.
- New exam-year imports land in production as UNPUBLISHED
  (visible only to authenticated admins) and are verified there —
  checked by the automated smoke verification and spot-checkable
  live-but-hidden, reversible via unpublish — before publishing.
  This unpublished-in-production state is the project's safe
  preview/rehearsal space; there is no separate staging stack.
- Results-day data flow: the new file is uploaded DIRECTLY to
  production as UNPUBLISHED, the automated smoke verification
  must pass, then publishing is an atomic flag flip that also
  purges the Cloudflare cache. Target: file to live in 5-10
  minutes.
- Configuration differs only via environment variables
  (.env.production locally vs. .env in local dev); never via code
  branches.
- A temporary, isolated environment may be spun up for a rare
  risky infrastructure or migration change (e.g. a major Postgres
  version bump) and torn down immediately after — it is not a
  permanent, continuously running stack.

## Performance Architecture

- Redis cache-aside on result lookups; cache invalidated by
  import/publish completion.
- Public GET responses send Cache-Control headers so Cloudflare
  edge-caches them (short TTL, e.g. 60 s on search, longer on
  result pages, purged after publish).
- Postgres indexes: attempts (exam_year, exam_no) unique;
  trigram/normalized name column(s) as needed for name search
  support. (No nni/match_key/person indexes — those columns and
  tables do not exist.)
- Import speed budget (results-day critical): clean + load + index
  for a 50k-row file completes in under 2 minutes. Mandates:
  Postgres COPY/batched inserts (never row-by-row), batched
  Meilisearch document pushes. There is no linking step.
- Rate limiting (Redis fixed window) on /api/search and the result
  endpoint; health endpoints exempt.
- Next.js: static/ISR rendering for public pages where possible,
  next/image, next/font, route-level code splitting, no
  blocking third-party scripts (PostHog loaded non-blocking). Any
  ISR-cached fetch of publish-sensitive data (e.g. the home page's
  published-years list) is tagged (`next.tags`) and purged via a
  session-gated Next.js route handler calling `revalidateTag(tag,
  { expire: 0 })`, triggered by the admin publish/unpublish action
  alongside the existing Redis/Cloudflare purges — Next's fetch
  cache is a separate layer from Redis and isn't touched by the
  api's own cache invalidation.

## Invariants

1. Request handlers never run long-lived work. Anything over
   ~1 s (Excel parsing, imports, reindexing) goes through BullMQ
   and the worker.
2. Postgres, Redis, and Meilisearch are never exposed publicly:
   no published ports in compose; only Caddy listens on 80/443.
3. All external input (query params, params, bodies, headers,
   uploaded file metadata) is validated with Zod at the API
   boundary before any logic runs.
4. The web app never imports server-only secrets; only
   NEXT_PUBLIC_* variables reach the browser.
5. Imports are idempotent: re-running any import job produces no
   duplicate attempts (DB constraints + upserts).
6. Meilisearch and Redis contents are always rebuildable from
   Postgres; no data lives only in them.
7. No PII in PostHog events, Sentry breadcrumbs/messages, or
   application logs. The project never stores NNI, birth date, or
   birth place at all; names, exam numbers, and results are never
   logged. Track behavior shapes (e.g. `result_searched
   {method: 'name'}`), never content.
8. Migrations are forward-only and run via drizzle-kit; the
   worker never alters schema.
9. Every dated value is stored as a proper DATE/TIMESTAMP in
   UTC; display formatting happens in the frontend.
10. New exam years import as unpublished; unpublished data is
    visible only to authenticated admins (pages, API, and search
    all respect the flag). Publishing is an atomic, reversible
    flag flip followed by cache purge.
11. Publishing is blocked until the automated smoke verification
    for that import has passed.
12. Cancelling a processing import (task 032) never leaves partial
    data: the loader's data-insert and its terminal status write
    are one Postgres transaction, so cancelling before that
    transaction commits — whether the loader's own cooperative
    check aborts it, or a forceful OS kill drops its connection —
    always rolls back to zero rows for that run. If the
    transaction already committed by the time cancellation is
    requested, it's too late to cancel; the import reports its
    real terminal state instead of a false `cancelled`.
