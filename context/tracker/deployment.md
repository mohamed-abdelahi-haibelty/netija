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
| POSTGRES_DB | docker, api, worker | Postgres database name | 002 |
| POSTGRES_USER | docker, api, worker | Postgres username | 002 |
| POSTGRES_PASSWORD | docker | Postgres password | 002 |
| DATABASE_URL | api, worker | Postgres connection DSN | 002 |
| REDIS_URL | api | Redis connection URL | 002 |
| MEILI_HOST | api, worker | Meilisearch base URL | 002 |
| MEILI_MASTER_KEY | docker, api, worker | Meilisearch master key | 002 |
| API_URL | web (server-side) | Internal API base URL | 002 |
| NEXT_PUBLIC_API_URL | web (browser) | Public API base URL | 002 |
| BETTER_AUTH_SECRET | api | Session signing secret | 002 |
| BETTER_AUTH_URL | api, web | Auth server base URL | 002 |
| SENTRY_DSN | api, worker | Sentry DSN (server) | 002 |
| NEXT_PUBLIC_SENTRY_DSN | web | Sentry DSN (browser) | 002 |
| NEXT_PUBLIC_POSTHOG_KEY | web | PostHog project key | 002 |
| NEXT_PUBLIC_POSTHOG_HOST | web | PostHog ingest host | 002 |
| CLOUDFLARE_API_TOKEN | api | Cloudflare cache purge token | 002 |
| CLOUDFLARE_ZONE_ID | api | Cloudflare zone ID | 002 |
| (append as tasks add them) | | | |

## External services & accounts needed

| Service | Purpose | Where the key lives | Added in task |
| ------- | ------- | ------------------- | ------------- |
| (e.g. Sentry, PostHog, Cloudflare API token) | | server .env only | |

## Deploy steps (current)

1. SSH to the VPS as the deploy user.
2. `git pull` (staging: main; production: the verified tag).
3. Run pending migrations (command: …).
4. `docker compose -f <env file> up -d --build`.
5. Verify `/health/ready` returns ok.
(Refine as tasks 029/030 finalize scripts.)

## Things that must run after specific deploys

| Condition | Required action | Added in task |
| --------- | --------------- | ------------- |
| First deploy ever | seed admin account (script) | 013 |
| After any import-pipeline change | rehearse on staging with last year's file | 030 |
| (append) | | |

## Scheduled jobs / cron

| Job | Schedule | Added in task |
| --- | -------- | ------------- |
| Nightly DB dump off-server | 03:00 | 029 |

## Known deployment gotchas

- (append as discovered: e.g. "worker image must be rebuilt when
  requirements.txt changes — compose build doesn't detect it",
  date-stamped, with the fix)
