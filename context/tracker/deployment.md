# Deployment Notes (living document)

> RULE FOR CLAUDE CODE: any task that changes something
> deployment-relevant MUST update this file in the same PR.
> Deployment-relevant means: a new environment variable, a new
> service or dependency, a migration that needs running, a new
> volume/folder, a changed port, a new external account/key, a
> new scheduled job, or a changed deploy step. A PR that adds an
> env var without updating this file and .env.example is
> incomplete.

## Required environment variables

| Variable | Used by | Purpose | Added in task |
| -------- | ------- | ------- | ------------- |
| APP_ENV | api, web (server), worker | Deployment environment tag (`production`, unset in local dev) — Sentry's `environment` plus the seed/reindex scripts' production guard | 026 |
| NEXT_PUBLIC_APP_ENV | web (browser) | Browser-visible copy of APP_ENV for the browser Sentry SDK — only `NEXT_PUBLIC_*` vars reach the browser (architecture.md invariant 4) | 026 |
| POSTGRES_DB | docker, api, worker | Postgres database name | 002 |
| POSTGRES_USER | docker, api, worker | Postgres username | 002 |
| POSTGRES_PASSWORD | docker | Postgres password | 002 |
| DATABASE_URL | api, worker | Postgres connection DSN | 002 |
| REDIS_URL | api | Redis connection URL | 002 |
| MEILI_HOST | api | Meilisearch base URL (api/src/lib/meili.ts) | 002 |
| MEILISEARCH_URL | api | Meilisearch base URL for `/health/ready` ONLY (api/src/routes/health.ts) — a separate variable from MEILI_HOST above, not a typo for it. Both must be set to the same value or `/health/ready` reports Meilisearch down even when it's fine. Found during the deploy runbook grep (2026-07-08); not fixed, since this is a code-only inconsistency and the runbook task was documentation-only. | 002 |
| MEILI_MASTER_KEY | docker, api | Meilisearch master key | 002 |
| API_URL | web (server-side) | Internal API base URL | 002 |
| NEXT_PUBLIC_API_URL | web (browser) | Public API base URL | 002 |
| WEB_URL | api | Web app origin — CORS (api/src/app.ts) and Better Auth trustedOrigins | 002 (undocumented until the deploy runbook grep, 2026-07-08) |
| BETTER_AUTH_SECRET | api | Session signing secret | 002 |
| BETTER_AUTH_URL | api | Auth server base URL | 002 |
| SENTRY_DSN | api, web (server), worker | Sentry DSN (server) | 002 |
| NEXT_PUBLIC_SENTRY_DSN | web | Sentry DSN (browser) | 002 |
| NEXT_PUBLIC_POSTHOG_KEY | web | PostHog project key | 002 |
| NEXT_PUBLIC_POSTHOG_HOST | web | PostHog ingest host | 002 |
| CLOUDFLARE_API_TOKEN | api | Cloudflare cache purge token | 002 |
| CLOUDFLARE_ZONE_ID | api | Cloudflare zone ID | 002 |
| UPLOADS_DIR | api, worker | Absolute path to the shared uploads volume; defaults to the repo-root `uploads/` folder when unset | 014 |
| PYTHON_BIN | api | Python interpreter used to spawn `worker/` CLI scripts (e.g. mapping preview); defaults to `python3` on PATH | 018 |
| WORKER_DIR | api | Absolute path to the `worker/` package; defaults to the repo-root `worker/` folder when unset | 018 |
| (append as tasks add them) | | | |

## External services & accounts needed

| Service | Purpose | Where the key lives | Added in task |
| ------- | ------- | ------------------- | ------------- |
| Sentry (sentry.io) | Error monitoring — api, web, worker | `.env.production` (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`) | 002 |
| PostHog (posthog.com, EU) | Anonymous product analytics — web only | `.env.production` (`NEXT_PUBLIC_POSTHOG_KEY`) | 002 |
| Cloudflare | DNS, DDoS, edge cache, cache purge on publish | `.env.production` (`CLOUDFLARE_API_TOKEN` scoped to Zone → Cache Purge, `CLOUDFLARE_ZONE_ID`) | 002 |
| Hetzner Cloud | VPS hosting | Hetzner Cloud Console (SSH key, no app-level key) | 029 |
| UptimeRobot | Uptime monitoring against `/health` | UptimeRobot dashboard only, no app-level key | 029 |

## Deploy steps (current)

Full step-by-step instructions (first deploy + ongoing updates) live in
`DEPLOYMENT-RUNBOOK.md` at the repo root — this section is the short
version.

**Production topology** (task 029, resolved 2026-07-08): one Docker Compose
stack on a single Hetzner VPS. `postgres`/`redis`/`meilisearch` publish no
ports at all (architecture.md invariant 2); `caddy` is the only service
publishing 80/443 and handles TLS automatically. The api and queue-worker
services share one image (`api/Dockerfile`) that bundles a Python venv with
`worker/requirements.txt` installed, so `api/src/lib/pythonRunner.ts` can
keep spawning `worker/*.py` as a subprocess exactly like it does in local
dev — resolving the "bundle Python into the api image or run api directly
on the VPS" question left open below in favor of the former.
`worker/Dockerfile` is NOT used in production (see the runbook's gap
analysis for why).

1. SSH to the VPS as the `deploy` user (never root).
2. `git fetch --tags && git checkout <verified tag>` (production deploys
   only from annotated tags, per git-conventions.md).
3. `docker compose --env-file .env.production -f docker-compose.prod.yml build`
4. Run pending migrations: `docker compose --env-file .env.production -f docker-compose.prod.yml run --rm api npm run db:migrate --workspace=api`
5. `docker compose --env-file .env.production -f docker-compose.prod.yml up -d`
6. Verify `/health/ready` returns 200 with all three deps `true` (watch
   for the MEILI_HOST/MEILISEARCH_URL trap above).
7. The `queue-worker` service (this repo's containerized equivalent of
   `npm run queue:worker`) is started by step 5 alongside `api` and
   `web` — confirmed imports enqueue a job but nothing drains the queue if
   this container isn't running; `docker compose ... ps` should show it
   healthy/running same as `api`.

## Things that must run after specific deploys

| Condition | Required action | Added in task |
| --------- | --------------- | ------------- |
| First deploy ever | seed admin account (script) | 013 |
| After any import-pipeline change | rehearse on production (unpublished) with last year's file | 030 |
| (append) | | |

## Scheduled jobs / cron

| Job | Schedule | Added in task |
| --- | -------- | ------------- |
| Nightly DB dump off-server | 03:00 | 029 |

## Known deployment gotchas

- (append as discovered: e.g. "worker image must be rebuilt when
  requirements.txt changes — compose build doesn't detect it",
  date-stamped, with the fix)
- 2026-07-03: the api process now spawns `worker/preview.py` directly
  (`PYTHON_BIN`/`WORKER_DIR`) for the mapping-preview endpoint, and task 019's
  queue worker spawns `worker/worker.py` the same way. In local dev both
  processes run on the host so this just works; in production the api
  container (or its host) needs a Python interpreter with worker/'s
  dependencies (pandas, openpyxl) installed and reachable at `PYTHON_BIN` —
  this must be settled when task 029 defines the production container
  topology (either bundle Python into the api image or run api directly on
  the VPS alongside worker's venv).
- 2026-07-03: `drizzle-orm`'s Postgres migrator decides what to apply by
  comparing each journal entry's `when` timestamp against a single snapshot
  of `MAX(created_at)` already recorded in the DB — it never checks migration
  hashes. A newly generated migration whose `when` (a plain `Date.now()`)
  lands earlier than an already-applied one's `when` gets silently skipped
  while drizzle-kit still prints "migrations applied successfully". This bit
  task 019 because this sandboxed dev environment's clock isn't guaranteed
  monotonic across sessions. Fixed for good: `npm run db:generate` now also
  runs `db:check-journal` (`api/scripts/check-migration-journal.ts`), which
  fails loudly if `drizzle/meta/_journal.json`'s `when` values aren't
  strictly increasing. If it ever fires, run `npm run db:fix-journal` to
  clamp the offending entries to `previous + 1` and sync the corresponding
  rows in `drizzle.__drizzle_migrations` (matched by the same sha256 hash
  drizzle itself uses) — never hand-edit the journal's timestamps directly.
  (Update: the pre-squash history this incident happened in no longer
  exists — see the "Squash migrations" progress-tracker entry — but the
  guard above stays wired into `db:generate` because the underlying clock
  issue is environmental, not historical, and can still recur on the next
  migration.)
- 2026-07-03: task 019's `api/src/lib/queue.ts` deliberately does not hand
  BullMQ a shared `ioredis.Redis` instance — BullMQ bundles its own pinned
  `ioredis` version, and TypeScript treats an instance from the app's own
  `ioredis` dependency (`lib/redis.ts`) as a structurally incompatible type
  when the two versions drift (they already do: app depends on `^5.11.1`,
  bullmq pins `5.10.1` exactly, so npm can't dedupe them into one copy).
  Fixed by passing plain `{host, port, username, password}` connection
  options instead, so BullMQ constructs its own connection. Re-check this if
  bumping either dependency ever makes the versions align.
- 2026-07-03: the queue worker (task 019) needs its own runnable Python
  environment exactly like the api process does for preview — same
  `PYTHON_BIN`/`WORKER_DIR` gotcha above applies to `npm run queue:worker`,
  not just `npm run dev` for the api server.
- 2026-07-04: task 020's real loader added `psycopg[binary]` to
  `worker/requirements.txt` — `worker/worker.py` and `worker/loader.py` now
  connect to Postgres directly (via `DATABASE_URL`, already an existing env
  var) to resolve an import's file path and to write `attempts`/`rejects`
  in one transaction, per architecture.md ("the worker, not the api, talks
  to Postgres for the load"). Any environment that runs `worker/` (the
  `PYTHON_BIN`/`WORKER_DIR` interpreter noted above) must have network
  access to the same Postgres the api uses, and `psycopg[binary]` must be
  installed alongside pandas/openpyxl when `requirements.txt` changes.
  `python-dotenv` was also added to `requirements-dev.txt` (test-only) so
  `pytest` can read `DATABASE_URL` from the repo-root `.env` the same way
  the api's vitest suites do — it is never imported by the pipeline itself.
- 2026-07-04: real historical result files (at least bac_2017 and bac_2020)
  are legacy binary `.xls`, not `.xlsx` — the api's upload route already
  sniffs and accepts both (`sniffExcelType` in `api/src/services/imports.ts`
  checks the OLE signature for `.xls`), but `worker/requirements.txt` only
  had `openpyxl` (xlsx-only). `pandas.read_excel` on a `.xls` file without
  `xlrd` installed throws `ImportError: Missing optional dependency 'xlrd'`,
  which `worker/preview.py` catches and reports as a clean `{ok: false,
  code: "UNREADABLE_FILE"}` — but `api/src/services/preview.ts` currently
  turns *any* `{ok: false}` from the worker into a generic 500 `INTERNAL`
  rather than surfacing error-handling.md's existing `UNSUPPORTED_FILE_TYPE`
  (415) code, so this looked like a server bug from the admin UI instead of
  an actionable "add xlrd" gap. Fixed by adding `xlrd==2.0.1` to
  `worker/requirements.txt` (pandas auto-picks openpyxl vs. xlrd by file
  extension, so no code change was needed once both are installed) — any
  environment running `worker/` must `pip install -r requirements.txt`
  again after this change. **Not done**: `preview.ts`/`importJob.ts` still
  don't map a genuine (post-fix) `UNREADABLE_FILE` to `UNSUPPORTED_FILE_TYPE`
  — logged as an open question below since it's a real gap independent of
  this fix.
- 2026-07-04: task 022's publish flow calls `purgeCloudflareCache()`
  (`api/src/lib/cloudflare.ts`) on every publish/unpublish. It silently
  no-ops whenever `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ZONE_ID` are unset —
  true in local dev and true in this sandboxed environment today, since no
  Cloudflare zone has been provisioned yet. When a real zone exists
  (production setup), set both vars or every publish will silently
  skip the edge purge (the DB flip, Meilisearch reindex, and Redis
  invalidation still happen regardless — only the Cloudflare-edge layer is
  affected, and its cache TTLs are short per architecture.md).
