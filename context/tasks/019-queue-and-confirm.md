# 019 — Job Queue, Confirm & Status

**Depends on:** 018, 015
**Context:** architecture.md (invariant 1, queue role), testing.md (confirm/status scenarios), error-handling.md (worker contract, retries).

## Goal

The hand-off machinery: confirming a mapping enqueues a durable background job; a Node worker drives the Python pipeline; status is observable.

## Requirements

- BullMQ queue on the existing Redis; concurrency 1; bounded retries with backoff for transient failures.
- Confirm endpoint (auth-protected): validates the mapping/year payload against the preview's import; enqueues exactly one job; returns 202; re-confirming the same import does not enqueue a duplicate; unknown import → 404.
- The confirmed mapping's manual corrections are persisted as learned aliases for future previews.
- A Node-side queue worker process that spawns the Python CLI with the job's arguments, consumes its JSON result, and records progress, summary, or precise failure reason onto the imports row through the status lifecycle (per the schema's states).
- Status endpoint exposing state, progress, summary, and failure reason.
- A job that exhausts retries marks the import failed with its reason; the system remains healthy.

## Out of scope

- The actual loading logic inside Python (020) — the Python side may still be a stub returning a fixed summary.

## Done when

- [ ] Tests (queue and spawn mocked at the boundary): single enqueue per confirm; duplicate-confirm safety; payload validation; alias persistence; status transitions including the failure path with reason recorded.
