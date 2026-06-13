# 001 — Scaffold the Monorepo

**Depends on:** nothing (first task)
**Context:** read all of `context/`; most relevant: ai-workflow-rules.md, code-standards.md, the repo structure doc.

## Goal

Create the repository skeleton, workspaces, and tooling so every later task lands in a consistent, buildable structure.

## Requirements

- Folder structure per the repo structure doc: `web/`, `api/`, `worker/`, `shared/`, `scripts/`, `context/`, `tasks/`, `uploads/` (gitignored, kept via .gitkeep).
- npm workspaces tying `web`, `api`, `shared` (worker is an independent Python package — leave it as an empty folder with a README note for now).
- TypeScript strict configuration shared/extended across the TS packages.
- ESLint + Prettier configured and runnable from the root.
- Root scripts: build, lint, typecheck, test — each running across workspaces (trivially passing while packages are empty).
- `.gitignore` covering `.env*`, `node_modules`, build outputs, `uploads/*`, Python caches/venv.
- Root `CLAUDE.md` instructing Claude Code to read everything in `context/` before any task and to follow `ai-workflow-rules.md`.
- Root README: what the project is (one paragraph), how to install and run the scripts.

## Out of scope

- Any application code, Docker, or dependencies beyond tooling.

## Done when

- [ ] Fresh clone: install succeeds; root build, lint, typecheck, test all pass.
- [ ] CLAUDE.md exists and references the context files and rules.
