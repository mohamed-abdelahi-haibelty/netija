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
