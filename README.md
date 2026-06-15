# Netija — Mauritanian Bac Results Portal

A public website where anyone can look up Mauritanian Baccalauréat (Bac) results by exam number or by student name with typo-tolerant autocomplete; admins upload yearly Excel result files through an authenticated dashboard, a Python/pandas pipeline cleans and imports them, and a post-import linking job merges each student's attempts across years into a single record — all designed to go from file upload to published, publicly searchable results in under 10 minutes on results day.

## Install

```bash
npm install
```

## Scripts

| Command | Description |
|---|---|
| `npm run build` | Compile all TypeScript workspaces |
| `npm run lint` | Run ESLint across all packages |
| `npm run typecheck` | Type-check all TypeScript packages |
| `npm run test` | Run tests across all packages |

## Repository Layout

```
web/        Next.js frontend (public site + admin dashboard)
api/        Hono REST API
shared/     API types shared between web and api
worker/     Python data pipeline (independent — not an npm workspace)
scripts/    Utility and admin scripts
uploads/    Shared volume for uploaded Excel files (gitignored)
context/    Project specs, architecture, standards, and task definitions
```

## Local Infrastructure (Docker)

The local development infrastructure runs PostgreSQL 16, Redis 7, and Meilisearch via Docker Compose.

### First-time setup

```bash
cp .env.example .env
# Edit .env — at minimum set POSTGRES_PASSWORD and MEILI_MASTER_KEY
docker compose up -d
```

### Starting and stopping

```bash
docker compose up -d      # start all services in the background
docker compose down        # stop and remove containers (data is preserved)
docker compose ps          # check running services and health status
docker compose logs -f     # stream logs from all services
```

### Where data lives

| Service      | Volume            | Host path (managed by Docker)                     |
|--------------|-------------------|---------------------------------------------------|
| PostgreSQL   | `postgres_data`   | `docker volume inspect netija_postgres_data`      |
| Meilisearch  | `meilisearch_data`| `docker volume inspect netija_meilisearch_data`   |
| Redis        | `redis_data`      | `docker volume inspect netija_redis_data`         |

Volumes are local to your machine and are never committed to the repository.

### Resetting all data

```bash
docker compose down -v     # stop containers and DELETE all named volumes
docker compose up -d       # recreate fresh empty services
```

> **Warning:** `down -v` permanently deletes all local database contents, search indexes, and queue state.
