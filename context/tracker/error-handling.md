# Error Handling

## Philosophy

Two kinds of errors exist and are treated differently:

- **Expected errors** (anticipated outcomes): not found, invalid
  input, unauthorized, rate limited, a rejected Excel row. These
  are normal control flow — return precise status codes and
  helpful messages. Never sent to Sentry.
- **Unexpected errors** (bugs, outages): anything else. Caught
  centrally, hidden from the user behind a generic message,
  always sent to Sentry with context.

Users never see stack traces, internal messages, or raw driver
errors. Logs and Sentry never contain PII (names, exam numbers,
NNI, birth dates, results) — log identifiers like import ids and
student row ids instead.

## The Standard Error Shape (API)

Every API error response has exactly this body:

```json
{ "error": { "code": "STUDENT_NOT_FOUND", "message": "No result found for this exam number and year." } }
```

- `code`: stable, SCREAMING_SNAKE machine code (frontends switch
  on it; never on the message text).
- `message`: human-readable, safe to display, no internals.
- Validation errors additionally include
  `"issues": [{ "path", "message" }]` from Zod.

Canonical codes (extend in this file before using new ones):
`VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401),
`FORBIDDEN` (403), `STUDENT_NOT_FOUND` (404),
`IMPORT_NOT_FOUND` (404), `RATE_LIMITED` (429),
`FILE_TOO_LARGE` (413), `UNSUPPORTED_FILE_TYPE` (415),
`MISSING_REQUIRED_COLUMNS` (422), `SMOKE_NOT_PASSED` (409),
`IMPORT_PROCESSING` (409),
`INTERNAL` (500), `SERVICE_UNAVAILABLE` (503).

## Hono API Rules

- Throw `HTTPException(status, { message })` for expected errors
  from any depth (routes or services); never hand-build error
  responses inside business logic.
- One central `app.onError`:
  - `HTTPException` → standard error shape with its status.
    Not reported to Sentry.
  - Anything else → log it, `Sentry.captureException(err,
    { extra: { path, method, requestId } })`, return
    `{ error: { code: "INTERNAL", message: "Internal Server
    Error" } }` with 500. Never include `err.message` in the
    response.
- One `app.notFound` returning the standard shape with 404.
- Validation: zValidator hooks return the standard shape with
  `VALIDATION_ERROR` and Zod issues; handlers never run on
  invalid input.
- Rate limiting throws 429 with a `Retry-After` header
  (seconds until window reset).
- `/health` never throws; `/health/ready` returns 503 with
  per-dependency booleans when Postgres/Redis/Meilisearch checks
  fail — it reports degradation rather than erroring.
- Every response includes an `X-Request-Id` (generated per
  request); it is attached to logs and Sentry events and shown
  in the frontend's generic error message ("Error id: …") so
  users can report issues traceably.

## Frontend (Next.js) Rules

- Route-level `error.tsx` boundaries wrap every public and admin
  route group: friendly message, a retry button, the request id
  when available. `global-error.tsx` exists as the last resort.
- Expected API errors are rendered as states, not thrown:
  - `STUDENT_NOT_FOUND` → "No result found. Check the exam
    number and the selected year." (with the year visible).
  - Autocomplete empty → a calm "no matching students" state
    (announced via aria-live), never an error toast.
  - `RATE_LIMITED` → "Too many searches — please wait a moment"
    with the retry countdown.
- Unexpected fetch failures (network, 500) → error boundary or
  inline retry UI; captured by Sentry via @sentry/nextjs.
- Forms (admin upload) show field-level messages from
  `issues[]`; submit buttons disable while pending; failures
  re-enable with the message — no silent dead ends, no raw
  error objects in the UI.
- Error states are accessible: focus moves to the error summary,
  messages tied to inputs via `aria-describedby`.

## Worker (Python) Rules

- Row-level problems are NOT exceptions: a row missing required
  fields, an unparseable date, an unknown decision variant is
  recorded in the reject report `{row_number, reason, column}`
  and counted. The import continues.
- File-level problems ARE failures: unreadable file, missing
  required columns after mapping, unconfigured date format →
  the job fails with a clear reason surfaced to the dashboard.
- Each import runs in a single Postgres transaction: a mid-import
  crash rolls back fully (no half-loaded years). Combined with
  upsert/ON CONFLICT, retries are safe (idempotent).
- BullMQ: max 2 retries with exponential backoff for transient
  failures; a job that exhausts retries is marked failed with
  its reason stored on the import record.
- Unexpected worker exceptions → Sentry (Python SDK) with
  `{import_id, file_id, stage}` context — never row contents.
- The worker exits non-zero on failure and prints a JSON
  `{ok: false, code, reason}` to stdout so the Node worker
  records a precise failure, not a generic one.

## Logging Conventions

- Structured logs (JSON in production): `level`, `msg`,
  `requestId`/`importId`, route or stage, duration.
- `info` for lifecycle (request completed, import finished with
  counts), `warn` for expected-but-notable (rate limit hits,
  rejected rows count), `error` only for unexpected failures.
- Never log request bodies, query values containing names/exam
  numbers/NNI, or result payloads.

## Sentry Configuration

- Environment-tagged as `production` (unset/local in dev, so
  local noise never pages anyone).
- `tracesSampleRate` low (≤ 0.1); errors always captured.
- `beforeSend` scrubs known PII fields defensively even though
  none should be present.
- Frontend, API, and worker each initialize their own SDK;
  initialization is first-import in the API (instrument.ts
  pattern) and via @sentry/nextjs config in web.

## What "Done" Means for Error Handling

A feature's error handling is complete when: every expected
failure returns the standard shape with the right code; the
unexpected path is covered by the central handler and visible in
Sentry (verified once deliberately); the frontend renders a
humane state for each expected code it can receive; and tests
exist for the failure paths (see testing.md).
