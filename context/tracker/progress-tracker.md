# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- In progress

## Current Goal

- Task 002 (next task — not yet started)

## Completed

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

## In Progress

- None.

## Next Up

- Task 002 (check `context/tasks/` for the next spec)

## Open Questions

- None yet.

## Architecture Decisions

- **Worker excluded from npm workspaces**: Python package has no npm integration; adding it as a workspace would cause `tsc`/`eslint` to try to process Python files. Left as a standalone folder per the task spec.
- **`"files": []` in workspace tsconfigs**: Prevents TypeScript from erroring with "No inputs were found" on empty workspaces. Will be replaced with `"include": ["src/**/*"]` when source files are added.
- **ESLint 9 flat config**: Used `eslint.config.mjs` (ESM) to avoid `"type"` conflicts with the root `package.json`. TypeScript rules use `projectService: true` for type-aware linting.

## Session Notes

- All four root scripts (`build`, `lint`, `typecheck`, `test`) pass on a fresh install.
- `npm install` installs 120 packages (TypeScript, ESLint 9 + TS plugin, Prettier). No app dependencies yet.
- Done-when checklist for Task 001: both items satisfied — fresh install succeeds, `CLAUDE.md` exists.
