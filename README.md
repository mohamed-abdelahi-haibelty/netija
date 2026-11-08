# Netija

A bilingual exam-results portal for Mauritania, built with Next.js, Hono, and a Python import pipeline. Supports Baccalauréat and Brevet results, French and Arabic interfaces, and an authenticated administration dashboard.

Netija addresses two different problems: making a result easy to find on a phone, and turning inconsistent historical Excel exports into validated, searchable records. The repository includes the application, import pipeline, and tests. It was built with AI assistance.

## What it does

- Search by exam number and year, or by name with typo-tolerant autocomplete.
- Switch between French and Arabic, including right-to-left layouts.
- Upload Excel files, review detected column mappings, and track background imports.
- Keep imports unpublished until automated smoke verification passes; publish or unpublish through an authenticated dashboard.
- Inspect and rebuild the search index, manage result caches, and cancel imports.

Each result represents **one exam attempt**. Repeated names are not treated as proof of identity and are never merged across years. NNI, birth dates, and birth places are excluded from the result model.

## Run locally

Requires Node.js 22, npm, Python 3.12, and Docker Compose. Run commands from the repository root unless indicated otherwise.

```bash
npm ci
cp .env.example .env
python3.12 -m venv worker/.venv
worker/.venv/bin/pip install -r worker/requirements-dev.txt
```

Edit `.env`: choose local database and Meilisearch passwords, match the database password in `DATABASE_URL`, generate `BETTER_AUTH_SECRET` with `openssl rand -hex 32`, and set `PYTHON_BIN` to the absolute path of `worker/.venv/bin/python`. Monitoring and analytics credentials may stay blank.

```bash
docker compose up -d --wait
npm run db:migrate --workspace=api
npm run db:seed --workspace=api
npm run dev
```

Open `http://localhost:3000`. The API listens on port 3001. The seed script supplies fabricated results for exploring the public search; no real student dataset is needed. To use the dashboard, set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and optionally `ADMIN_NAME` in your local `.env`, then run:

```bash
npm run auth:create-admin --workspace=api
```

The development command starts the frontend, API, and queue consumer. Local infrastructure ports bind to loopback; the production topology is separate.

## Verify

**Use a disposable database.** API schema tests and Python integration tests truncate import/result tables. Never point tests at production or a database containing data you want to retain. Apply migrations to the test database before running these commands.

```bash
npm run lint
npm run typecheck
npm test
npm run build
cd worker
.venv/bin/pytest
.venv/bin/ruff check .
```

GitHub Actions runs these checks with disposable PostgreSQL, Redis, and Meilisearch services. Tests cover API validation/authentication, import lifecycle, bilingual components and accessibility, historical spreadsheet formats, and database constraints. The `load-tests/` directory contains k6 scenarios for results-day traffic; performance targets are not claims of measured production capacity.

## Repository map

| Directory | Responsibility |
| --- | --- |
| `web/` | Next.js public pages, bilingual UI, admin dashboard, component tests |
| `api/` | Hono routes, services, Drizzle schema/migrations, queue consumer, API tests |
| `shared/` | TypeScript API contracts |
| `worker/` | Spreadsheet mapping, cleaning, transactional loading, synthetic fixtures |
| `load-tests/` | k6 scenarios and monitoring instructions |

## Data and reuse

This is application source, not an official exam-results dataset. Uploads, credentials, database dumps, and student records do not belong in Git. Test spreadsheet fixtures use fabricated data.

No source license has been selected. Bundled third-party assets may have separate licensing terms.
