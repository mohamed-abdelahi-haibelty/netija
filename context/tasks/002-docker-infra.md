# 002 — Development Docker Infrastructure

**Depends on:** 001
**Context:** architecture.md (stack, environments, invariants 2).

## Goal
One command brings up the local infrastructure: PostgreSQL, Redis, and Meilisearch.

## Requirements
- `docker-compose.yml` with pinned image versions for Postgres 16, Redis 7, Meilisearch.
- Persistent named volumes for Postgres and Meilisearch data.
- Healthchecks on all three services.
- For local development, ports may be bound to 127.0.0.1 only (production compose in task 029 publishes nothing internal).
- `.env.example` listing every variable the system will need (DB URL, Redis URL, Meili host/key, app URLs, placeholders for Sentry/PostHog/Cloudflare), with comments. No real secrets.
- README section: starting/stopping infra, where data lives, how to reset.

## Out of scope
- Production compose, Caddy, app containers (task 029).

## Done when
- [ ] `docker compose up -d` results in three healthy containers.
- [ ] Connection details in `.env.example` are correct for the local setup.
- [ ] Documented reset flow works (down + volume removal + up).
