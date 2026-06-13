# AI Workflow Rules

## Approach

Build this project incrementally using a spec-driven workflow.
The context files (`project-overview.md`, `architecture.md`,
`code-standards.md`, `testing.md`, `error-handling.md`) define
what to build, how to build it, and the rules it must follow.
Each unit of work has its own task spec MD file. Always implement
against these specs — do not infer or invent behavior from
scratch. The human reviews every change; optimize for
reviewability: small diffs, clear naming, tests proving behavior.

## Scoping Rules

- Work on one feature unit (one task spec) at a time.
- Prefer small, verifiable increments over large speculative
  changes.
- Do not combine unrelated system boundaries (web/, api/,
  worker/, infra) in a single implementation step unless the
  task spec explicitly spans them.
- Write or update tests in the same unit as the code they cover —
  failure paths included (see testing.md).

## When to Split Work

Split an implementation step if it combines:

- UI changes and background job / worker changes.
- Multiple unrelated API routes.
- Schema/migration changes and feature logic (migrate first,
  verify, then build on it).
- Behavior not clearly defined in the context files.

If a change cannot be verified end to end quickly (run the tests,
hit the route, see the screen), the scope is too broad — split it.

## Handling Missing Requirements

- Do not invent product behavior not defined in the context
  files or the current task spec.
- If a requirement is ambiguous, resolve it in the relevant
  context file before implementing.
- If a requirement is missing, add it as an open question in
  `progress-tracker.md` and stop that thread of work rather
  than guessing.
- Domain questions that commonly arise here (write the answer
  into the spec before coding): how a new Decision variant or
  SERIE value should map; how a new year's column name maps;
  whether a field is required or optional on import.

## Protected Files

Do not modify the following unless explicitly instructed:

- `web/components/ui/*` — shadcn-generated components
  (compose them; do not edit internals).
- `api/drizzle/*` applied migration files — never edit an
  applied migration; create a new one.
- `docker-compose.yml`, `docker-compose.staging.yml`,
  `Caddyfile`, and any `.env*` files.
- Original uploaded Excel fixtures under `worker/tests/fixtures/`
  (they encode real historical formats).

## Keeping Docs in Sync

Update the relevant context file in the same unit of work
whenever implementation changes:

- System architecture, boundaries, or the storage model
  → `architecture.md`.
- Code conventions or standards → `code-standards.md`.
- Testing approach or new fixture formats → `testing.md`.
- Error codes or handling policy → `error-handling.md`.
- Feature scope → `project-overview.md`.
- Newly learned column aliases or decision variants from a real
  file → note in `progress-tracker.md` and add to fixtures.

## Security & Privacy Rules for Generated Code

- Never hardcode secrets, tokens, or connection strings; read
  from environment variables only.
- Never log or send to Sentry/PostHog any PII: names, exam
  numbers, NNI, birth dates, results (see architecture.md
  invariant 7).
- Never add a `ports:` mapping for Postgres, Redis, or
  Meilisearch in compose files.
- All new mutating routes must enforce the Better Auth session;
  absence of auth on a mutating route is a defect, not a TODO.

## Before Moving to the Next Unit

1. The current unit works end to end within its defined scope.
2. No invariant defined in `architecture.md` was violated.
3. Tests required by `testing.md` for this unit exist and pass
   (including failure paths).
4. `npm run build` passes for affected JS/TS packages;
   `pytest` passes if `worker/` was touched.
5. Lint/typecheck pass (`tsc --noEmit`, eslint, ruff).
6. `progress-tracker.md` reflects the completed work and any
   open questions.
