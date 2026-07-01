# 013 — Admin Authentication

**Depends on:** 004, 005
**Context:** architecture.md (auth model), error-handling.md (401/403), ai-workflow-rules.md (security rules).

## Goal
Better Auth protecting everything administrative: no public signup, seeded admins, enforced server-side.

## Requirements
- Better Auth with email/password; registration disabled publicly.
- A script in `scripts/` creating/updating an admin account from environment-provided credentials.
- Auth schema added via a new migration (never editing applied ones).
- API middleware: every mutating/admin route requires a valid session (401 otherwise) — enforcement at the API, not the UI.
- Admin login page (localized) and logout; unauthenticated visits to /admin pages redirect to login; authenticated ones reach a minimal dashboard shell.

## Out of scope
- Dashboard features (014+); roles beyond a single admin level.

## Done when
- [ ] Tests: protected API route → 401 without session, 200 with; login flow succeeds for the seeded admin and rejects wrong credentials; /admin redirects when unauthenticated.
- [ ] Public routes remain accessible without any session.
