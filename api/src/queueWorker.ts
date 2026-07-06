import './instrument.js';
import * as Sentry from '@sentry/node';
import { Worker } from 'bullmq';
import { db } from './db/client.js';
import { IMPORT_QUEUE_NAME, queueConnection, type ImportJobData } from './lib/queue.js';
import { ImportCancelledError, ImportJobError, markImportFailed, runImportJob } from './services/importJob.js';

// Node-side queue worker process (task 019): drives worker/worker.py per
// confirmed import. Concurrency 1 — imports never run two at a time (see
// architecture.md's results-day speed budget; a second concurrent import
// would contend for the same load-time resources for no benefit at this
// project's scale). Entry point only; the testable logic lives in
// services/importJob.ts, mirroring app.ts/server.ts's split.
const worker = new Worker<ImportJobData>(IMPORT_QUEUE_NAME, (job) => runImportJob(db, job.data), {
  connection: queueConnection,
  concurrency: 1,
});

// BullMQ fires 'failed' after every failed attempt, including ones that
// still have retries left — only mark the import failed once attemptsMade
// reaches the configured limit (lib/queue.ts's IMPORT_JOB_ATTEMPTS).
worker.on('failed', (job, err) => {
  if (!job) return;

  if (err instanceof ImportCancelledError) {
    // runImportJob already finalized the import row to 'cancelled' itself
    // (task 032) before throwing this — an UnrecoverableError, so BullMQ
    // never retries it regardless of attempts remaining. Nothing left to
    // do here, and markImportFailed below must NOT run — it would
    // overwrite the row back to 'failed'.
    return;
  }

  const attemptLimit = job.opts.attempts ?? 1;
  if (job.attemptsMade < attemptLimit) return;

  const reason = err instanceof ImportJobError ? err.message : 'Import failed unexpectedly.';
  // ImportJobError is worker.py's own precise, expected failure contract
  // (error-handling.md's "file-level problems ARE failures") — already
  // surfaced to the dashboard via failureReason, so not sent to Sentry.
  // Anything else here is a bug in this Node glue code itself.
  if (!(err instanceof ImportJobError)) {
    Sentry.captureException(err, { extra: { importId: job.data.importId } });
  }
  markImportFailed(db, job.data.importId, reason).catch((updateErr: unknown) => {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'failed to record import failure',
        importId: job.data.importId,
        error: updateErr instanceof Error ? updateErr.message : String(updateErr),
      }),
    );
  });
});

worker.on('error', (err) => {
  console.error(JSON.stringify({ level: 'error', msg: 'queue worker connection error', error: err.message }));
  Sentry.captureException(err);
});

console.log(JSON.stringify({ level: 'info', msg: 'import queue worker started' }));
