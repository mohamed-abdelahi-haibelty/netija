# Git Conventions

## Branch model

- `main` is the only long-lived branch. It is always deployable
  and is what STAGING runs.
- PRODUCTION deploys only from annotated tags (`v<major>.<minor>.<patch>`)
  cut from main after staging verification. The tag is the
  promotion; every tag is a rollback point.
- One task = one branch = one PR. Branch name:
  `task/<number>-<short-name>` (e.g. `task/021-linking-job`).
  Fixes outside a task use `fix/<short-name>`.
- Never commit directly to main. Never rebase or force-push a
  branch after review has started.

## Commit messages (Conventional Commits)

Format: `<type>(<scope>): <subject> [task NNN]`

- type: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`,
  `perf`, `ci`.
- scope: the package touched — `web`, `api`, `worker`, `shared`,
  `infra`, `context`.
- subject: imperative, lower case, no trailing period, ≤ 72
  chars, describes the behavior change (not the file change).
- Reference the task number whenever the commit belongs to one.

Examples:

- `feat(api): exam-number search with redis cache [task 007]`
- `test(worker): decision normalization covers all 2015-2024 variants [task 017]`
- `fix(web): combobox arrow navigation skips disabled items [task 011]`
- `docs(context): record date-format decision in progress tracker`

Body (when the change isn't self-evident): explain WHY, not what
— the diff shows what. Note any invariant or context-file
implication. Footer: `BREAKING CHANGE:` when applicable.

## Commit hygiene

- Commit per logical unit, not per session. A task usually
  yields 2–6 commits (e.g. schema, logic, tests, docs) — never
  one giant "task 021" commit, never 40 micro-commits.
- Tests land in the same PR as the code they verify; a commit
  that turns CI red must be fixed by the next commit, not left.
- NEVER commit: `.env*` files, secrets or tokens, `uploads/`
  contents, real personal data (names, NNI, birth dates) in any
  form — including in fixtures, test snapshots, or examples.
- Generated artifacts (build output, lockfile churn unrelated to
  the change) stay out of feature commits.

## Pull requests

- One PR per task. Title: `Task NNN — <task title>`.
- Description: link the task spec, summarize the approach in 2–4
  sentences, paste the "Done when" checklist with each item
  checked, and note anything deliberately deferred (with a
  progress-tracker entry).
- CI (build, typecheck, lint, tests) must be green before merge.
- Automated review comments (e.g. CodeRabbit) are advisory:
  evaluate each, apply or reject with a one-line reason. The
  human reviewer's approval is the merge gate.
- Merge strategy: squash is forbidden when commits are clean per
  the hygiene rules above; use a merge commit so task history
  stays readable. (If a branch's history is messy, clean it
  BEFORE review starts.)

## Releases (production promotion)

1. main is deployed to staging and verified (for data releases:
   the results-day runbook; for code: the affected flows).
2. Cut an annotated tag from the verified commit:
   `git tag -a v1.4.0 -m "publish flow + suggestion review"`.
3. Deploy the tag to production via the deploy script.
4. If production misbehaves, redeploy the previous tag first,
   diagnose second.
- Version bumps: patch = fixes only, minor = new features,
  major = breaking/data-model changes.

## For Claude Code specifically

- Read this file before any commit or PR action.
- When a task is complete, propose the commit series and PR
  description; do not push or merge — the human does both.
- If work in progress must be saved mid-task, use
  `chore(<scope>): wip — <state>` on the task branch and say so;
  wip commits are squashed into proper commits before review.
