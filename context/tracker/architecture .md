# Architecture Context

## Stack

| Layer            | Technology                                                   | Role                                                  |
| ---------------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| Frontend         | Next.js 16 + TypeScript                                      | Public site + admin dashboard UI                      |
| UI               | Tailwind CSS + shadcn/ui                                     | Styling and component library                         |
| Backend API      | Hono (Node.js runtime) + TypeScript                          | REST API: search, students, imports, health           |
| Auth             | Better Auth                                                  | Admin-only email/password auth; sessions              |
| Database         | PostgreSQL 16 + Drizzle ORM                                  | Source of truth: students, attempts, imports, aliases |
| Cache / Queue    | Redis 7 (ioredis) + BullMQ                                   | Result cache, rate limiting, import job queue         |
| Search           | Meilisearch                                                  | Typo-tolerant name autocomplete (FR + AR)             |
| Data pipeline    | Python 3.12 + pandas + openpyxl                              | Excel reading, cleaning, identity resolution, loading |
| Analytics        | PostHog Cloud (EU, anonymous only)                           | Product analytics; no PII in events                   |
| Error monitoring | Sentry (@sentry/nextjs, @sentry/node, sentry-sdk for Python) | Capture unexpected errors everywhere                  |
| Edge             | Cloudflare (free plan)                                       | DNS, DDoS protection, bot mitigation, edge cache      |
| Reverse proxy    | Caddy                                                        | TLS termination, routes domains to services           |
| Infra            | Docker Compose on a single VPS (Ubuntu 24.04, 8 GB)          | Runs all services for prod + staging                  |

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
- `worker/` — Python pipeline. Owns Excel reading, cleaning,
  column mapping, identity resolution, loading Postgres,
  Meilisearch reindex, static reject reports. Never serves HTTP
  to the public.
- `uploads/` — shared volume between api and worker for uploaded
  Excel files.
- Root `docker-compose.yml` + `docker-compose.staging.yml` — own
  the runtime topology. `Caddyfile` owns routing/TLS.
- In Next.js 16, middleware.ts was renamed to proxy.ts

## Storage Model

- **PostgreSQL**: attempts (one immutable row per exam sitting —
  the source of truth; carries exam_year, exam_no, nni, name_fr,
  name_ar, birth_date, birth_place, serie, moyenne, decision +
  decision_raw, optional school/wilaya, and a precomputed
  match_key), persons (minimal identity anchors with cached
  display names), person_links (attempt_id UNIQUE → person_id,
  method 'nni' | 'match_key' | 'manual' — identity lives here
  and is reversible), link_suggestions (pending/accepted/rejected
  review queue; pending rows also power the public "other records
  with this name" section), imports (file metadata, status,
  summary counts, and the published flag per exam year),
  column_aliases (learned header mappings), rejects (per-import
  rejected rows with reasons), Better Auth tables.
- **Redis**: cache of student-page payloads (TTL ≥ 300 s,
  invalidated on import), rate-limit counters, BullMQ job state.
- **Meilisearch**: derived search index of persons
  (person_id, name_fr, name_ar, latest_year, serie, birth_place
  — the latter three shown in suggestions to disambiguate
  identical names). Rebuildable from Postgres at any time; never
  the source of truth; only published years are indexed.
- **Filesystem volume**: original uploaded Excel files (kept —
  they are the ultimate recovery source).

## Data Model Invariants (domain-critical)

- `attempts` has UNIQUE (exam_year, exam_no). Exam numbers are
  5-digit strings (leading zeros preserved — always TEXT, never
  numeric) and are only unique within a year.
- NEVER trust the file's schema. The only columns guaranteed in
  every year's file are the exam number and at least one name
  (French or Arabic). NNI, birth_date, birth_place, serie,
  school, wilaya, and everything else are nullable and may be
  absent in any future year (e.g. 2022 has no NNI while 2021 and
  2023 do). Field availability is detected per file from the
  mapped columns — never hardcoded by year.
- `attempts.nni` is a 10-digit string when the file provides it;
  indexed. `attempts.match_key` = sha256(normalized name without
  spaces | birth_date ISO | normalized birth_place), computed at
  import only for rows where all three parts exist; indexed.
  Both are opportunistic linking signals, never requirements.
- Imports never decide identity. Linking is a separate, set-based
  job that runs after each import over that import's attempts:
  Pass 1 links by NNI (certain); Pass 2 links by exact match_key,
  including bridging onto persons already linked via NNI; Pass 3
  gives every still-unlinked attempt its own person (every
  attempt ALWAYS has a person and a working public page); Pass 4
  emits link_suggestions for looser matches (same name + date but
  differing/missing place, fuzzy Arabic-name matches) — it never
  auto-links.
- Prefer false splits over false merges: ambiguity becomes a
  suggestion for human review, never an automatic merge. A wrong
  merge (showing someone another person's failure) is the worst
  defect in the system.
- person_links.attempt_id is UNIQUE; merge/unmerge are row
  operations on person_links and are always reversible. A full
  relink rebuild (wipe person_links + link_suggestions, re-run
  all passes over all attempts) is a supported command and must
  be deterministic.
- A row imports as long as it has exam_year, exam_no, and at
  least one name; missing NNI/birth data only affects linking
  (Pass 3), not import. Rows below that bar are rejected with
  reasons.
- Decision values are normalized to a fixed enum on import:
  `Admis`, `Ajourné`, `Sessionnaire`, `Absent`, `Délibérable`,
  `Annulé`. Raw source variants (`Ajourné(e)`, `Ajourné Sn`,
  `Sessionaire`, `Abscent`, `Examen annulé CT ...`, `Admis Sn`)
  map onto these; the raw value is preserved in a
  `decision_raw` column.
- Moyenne is stored as numeric out of 20.
- SERIE (track: SN, LM, LO, M, TM, TS, LA, …) is stored as text
  on the attempt; new series may appear in future years and must
  not break imports.
- Date parsing is per-file-format: some years are day-first
  (`06/02/02`), some month-first (`6/20/1995`), some
  `5-Mar-02`. The worker must detect/configure format per import,
  never guess per-row.

## Auth and Access Model

- Public routes (search, student pages, health) require no auth.
- All `/admin` UI routes and all mutating API routes
  (upload, confirm, delete) require a Better Auth session.
- There is no public registration. Admin accounts are seeded or
  created via a CLI script.
- The API enforces auth server-side on every protected route;
  the frontend hiding a button is never the security boundary.

## Environments

- **Production** and **staging** run on the same VPS as two
  separate Docker Compose projects with separate databases,
  Redis instances, Meilisearch indexes, and upload volumes.
- Caddy routes `<domain>` → production web/api and
  `staging.<domain>` → staging web/api.
- Staging is functionally identical to production. Its roles:
  code deploys go to staging first, and the full results-day
  import pipeline is rehearsed there with last year's file.
- Results-day data flow: the new file is uploaded DIRECTLY to
  production as UNPUBLISHED (visible only to admins), the
  automated smoke verification must pass, then publishing is an
  atomic flag flip that also purges the Cloudflare cache.
  Target: file → live in 5–10 minutes.
- `staging.<domain>` sends `X-Robots-Tag: noindex` and is
  excluded from sitemaps.
- Configuration differs only via environment variables
  (.env.production / .env.staging); never via code branches.

## Performance Architecture

- Redis cache-aside on student lookups; cache invalidated by
  import completion.
- Public GET responses send Cache-Control headers so Cloudflare
  edge-caches them (short TTL, e.g. 60 s on search, longer on
  student pages, purged after imports).
- Postgres indexes: attempts (exam_year, exam_no) unique,
  attempts.nni, attempts.match_key, person_links.person_id,
  person_links.attempt_id unique; trigram/normalized name
  columns as needed.
- Import speed budget (results-day critical): clean + load +
  link + index for a 50k-row file completes in under 2 minutes.
  Mandates: Postgres COPY/batched inserts (never row-by-row),
  set-based linking SQL (no per-row loops), batched Meilisearch
  document pushes.
- Rate limiting (Redis fixed window) on /api/search and
  /api/students; health endpoints exempt.
- Next.js: static/ISR rendering for public pages where possible,
  next/image, next/font, route-level code splitting, no
  blocking third-party scripts (PostHog loaded non-blocking).

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
   NEXT*PUBLIC*\* variables reach the browser.
5. Imports are idempotent: re-running any import job produces no
   duplicate attempts or persons (DB constraints + upserts), and
   the relink job is deterministic.
6. Meilisearch and Redis contents are always rebuildable from
   Postgres; no data lives only in them.
7. No PII (names, exam numbers, NNI, results) in PostHog events,
   Sentry breadcrumbs/messages, or application logs. Track
   behavior shapes (e.g. `result_searched {method: 'name'}`),
   never content.
8. Staging and production share no databases, queues, indexes,
   or upload volumes.
9. Migrations are forward-only and run via drizzle-kit; the
   worker never alters schema.
10. Every dated value is stored as a proper DATE/TIMESTAMP in
    UTC; display formatting happens in the frontend.
11. New exam years import as unpublished; unpublished data is
    visible only to authenticated admins (pages, API, and search
    all respect the flag). Publishing is an atomic, reversible
    flag flip followed by cache purge.
12. Publishing is blocked until the automated smoke verification
    for that import has passed.
13. Identity link suggestions never block import or publish;
    they are reviewed after going live.
