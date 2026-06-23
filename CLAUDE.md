# Claude Code Instructions

**Before starting any task**, read all files in `context/tracker/` and follow `context/tracker/ai-workflow-rules.md`.

## Required Reading (every session)

- [project-overview.md](context/tracker/project-overview.md) — project goals and user flows
- [architecture .md](context/tracker/architecture%20.md) — system architecture, stack, boundaries, data model, invariants
- [code-standards.md](context/tracker/code-standards.md) — TypeScript, Next.js, API, Python conventions
- [testing.md](context/tracker/testing.md) — testing approach and requirements
- [error-handling.md](context/tracker/error-handling.md) — error codes and handling policy
- [git-conventions.md](context/tracker/git-conventions.md) — commit and PR conventions
- [deployment.md](context/tracker/deployment.md) — deployment setup
- [ai-workflow-rules.md](context/tracker/ai-workflow-rules.md) — **workflow rules (required)**
- [progress-tracker.md](context/tracker/progress-tracker.md) — current phase, completed work, open questions

## Task Specs

Individual task specs live in `context/tasks/`. Work on one task at a time per `ai-workflow-rules.md`.

## Next.js 16 (web/)

This project uses **Next.js 16**, which has breaking changes from earlier versions — APIs, conventions, and file structure differ from training data. Before writing any code in `web/`, read the relevant guide in `web/node_modules/next/dist/docs/`. Key changes already applied:

- `middleware.ts` is renamed to `proxy.ts`; the exported function is `proxy`, not `middleware`.
- `PageProps` and `LayoutProps` are globally available TypeScript helpers (no import needed).
- `error.tsx` uses `unstable_retry` prop instead of `reset`.

## Key Rules

1. Read all of `context/tracker/` before implementing any task.
2. Follow `ai-workflow-rules.md` strictly — no invented behavior.
3. Update `progress-tracker.md` after every meaningful implementation change.
4. Do not modify protected files (shadcn components, applied migrations, compose files, `.env*`).
5. TypeScript strict mode everywhere — no `any`, builds must pass.
6. Never log or send PII (names, exam numbers, NNI) to Sentry or PostHog.
