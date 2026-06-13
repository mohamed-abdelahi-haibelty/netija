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

## Key Rules

1. Read all of `context/tracker/` before implementing any task.
2. Follow `ai-workflow-rules.md` strictly — no invented behavior.
3. Update `progress-tracker.md` after every meaningful implementation change.
4. Do not modify protected files (shadcn components, applied migrations, compose files, `.env*`).
5. TypeScript strict mode everywhere — no `any`, builds must pass.
6. Never log or send PII (names, exam numbers, NNI) to Sentry or PostHog.
