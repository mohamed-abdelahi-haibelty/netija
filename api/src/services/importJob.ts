import * as Sentry from '@sentry/node';
import { UnrecoverableError } from 'bullmq';
import { and, eq, notInArray } from 'drizzle-orm';
import { resolve } from 'node:path';
import type { Db } from '../db/client.js';
import { imports } from '../db/schema.js';
import { runPythonScript } from '../lib/pythonRunner.js';
import type { ImportJobData } from '../lib/queue.js';
import { runSmokeVerification } from './smokeVerification.js';

const PYTHON_BIN = process.env['PYTHON_BIN'] ?? 'python3';
// Same convention as preview.ts's WORKER_DIR/PYTHON_BIN.
const WORKER_DIR = process.env['WORKER_DIR'] ?? resolve(process.cwd(), '../worker');
const WORKER_SCRIPT = resolve(WORKER_DIR, 'worker.py');

interface PythonWorkerSuccess {
  ok: true;
  inserted: number;
  rejected: number;
  duplicates_skipped: number;
}

interface PythonWorkerFailure {
  ok: false;
  code: string;
  reason: string;
}

// Thrown when worker.py reports an expected, precise failure (its
// {ok: false, code, reason} contract, see error-handling.md's worker
// contract) so that reason — not a generic message — is what ends up on the
// imports row once retries are exhausted.
export class ImportJobError extends Error {
  constructor(
    public readonly code: string,
    reason: string,
  ) {
    super(reason);
    this.name = 'ImportJobError';
  }
}

// Thrown when this attempt ends because of an admin-requested cancellation
// (task 032) — extends BullMQ's own UnrecoverableError so the queue never
// retries a deliberate cancellation, regardless of attempts remaining. The
// import row is already finalized to 'cancelled' by the time this is
// thrown, so queueWorker.ts's `failed` handler treats it as a no-op rather
// than re-marking the import failed.
export class ImportCancelledError extends UnrecoverableError {
  constructor(reason: string) {
    super(reason);
    this.name = 'ImportCancelledError';
  }
}

// Runs once per BullMQ attempt (queueWorker.ts wires this as the job
// processor): marks the import processing, spawns worker/worker.py with the
// job's arguments, and records the summary on success. On an expected
// Python-reported failure it throws ImportJobError so BullMQ retries per
// lib/queue.ts's bounded backoff; queueWorker.ts's `failed` handler marks
// the import failed for good once retries are exhausted.
//
// worker.py owns loading into Postgres directly (see architecture.md — the
// worker, not the api, talks to Postgres for the load) so only the import id
// is passed as --file-id; the loader (task 020) is expected to resolve the
// file path itself from the imports row.
export async function runImportJob(db: Db, data: ImportJobData): Promise<void> {
  // Conditional on NOT already cancelling/cancelled (task 032): closes the
  // race where a cancel request flips the row before this attempt's very
  // first write would otherwise unconditionally stomp it back to
  // 'processing'. If cancellation won that race, there is nothing to run —
  // the cancel route already owns finalizing the row.
  const [claimed] = await db
    .update(imports)
    .set({ status: 'processing', progress: 0, updatedAt: new Date() })
    .where(and(eq(imports.id, data.importId), notInArray(imports.status, ['cancelling', 'cancelled'])))
    .returning({ id: imports.id });

  if (!claimed) return;

  let stdout: string;
  try {
    stdout = await runPythonScript(
      PYTHON_BIN,
      WORKER_SCRIPT,
      ['--file-id', String(data.importId), '--exam-year', String(data.examYear), '--mapping', JSON.stringify(data.mapping)],
      (pid) => {
        // Fire-and-forget: a failure to persist the pid only means a
        // force-kill has nothing to target, cooperative cancellation still
        // works regardless (see cancelImport.ts).
        void db.update(imports).set({ workerPid: pid ?? null }).where(eq(imports.id, data.importId));
      },
    );
  } catch (err) {
    await db.update(imports).set({ workerPid: null }).where(eq(imports.id, data.importId));

    const [current] = await db
      .select({ status: imports.status })
      .from(imports)
      .where(eq(imports.id, data.importId))
      .limit(1);
    if (current?.status === 'cancelling') {
      // We killed this process on purpose (cancelImport.ts's force-kill
      // escalation for a run stuck between cooperative checkpoints) —
      // finalize as cancelled, not as a crash to retry.
      await db
        .update(imports)
        .set({ status: 'cancelled', progress: null, failureReason: null, updatedAt: new Date() })
        .where(eq(imports.id, data.importId));
      throw new ImportCancelledError('Import was cancelled by an admin.');
    }
    throw err;
  }

  await db.update(imports).set({ workerPid: null }).where(eq(imports.id, data.importId));

  const output = JSON.parse(stdout.trim()) as PythonWorkerSuccess | PythonWorkerFailure;
  if (!output.ok) {
    if (output.code === 'CANCELLED') {
      // loader.py's transaction has already rolled back (see loader.py's
      // ImportCancelled) — zero rows for this import. Finalize the status
      // the cancel route already started ('cancelling').
      await db
        .update(imports)
        .set({ status: 'cancelled', progress: null, failureReason: null, updatedAt: new Date() })
        .where(eq(imports.id, data.importId));
      throw new ImportCancelledError(output.reason);
    }
    throw new ImportJobError(output.code, output.reason);
  }

  // status/summary are now written atomically by loader.py itself, inside
  // the SAME transaction as the data (task 032's loader-atomicity fix) —
  // this closes the old gap where a crash between "rows committed" and
  // "status flipped to completed" could leave an import stuck reading
  // 'processing' forever despite already having real data. Only progress
  // (cosmetic, best-effort — see loader.py's own docstring) is finished
  // here.
  await db.update(imports).set({ progress: 100, updatedAt: new Date() }).where(eq(imports.id, data.importId));

  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'import finished',
      importId: data.importId,
      inserted: output.inserted,
      rejected: output.rejected,
      duplicatesSkipped: output.duplicates_skipped,
    }),
  );
  if (output.rejected > 0) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        msg: 'import completed with rejected rows',
        importId: data.importId,
        rejected: output.rejected,
      }),
    );
  }

  // Smoke verification runs automatically after every completed import
  // (testing.md) and gates publish (architecture.md invariant 12). A bug in
  // the check itself must not undo a genuinely successful import or trigger
  // a pointless re-run of the whole Python pipeline via BullMQ retries — so
  // an unexpected failure here is recorded as smokePassed: false (fail
  // closed, blocking publish) rather than rethrown.
  let smoke;
  try {
    smoke = await runSmokeVerification(db, data.importId);
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'smoke verification threw unexpectedly',
        importId: data.importId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    Sentry.captureException(err, { extra: { importId: data.importId, stage: 'smoke-verification' } });
    smoke = { passed: false, reason: 'Smoke verification failed unexpectedly.' };
  }

  await db
    .update(imports)
    .set({ smokePassed: smoke.passed, updatedAt: new Date() })
    .where(eq(imports.id, data.importId));
}

// Called once a job exhausts its bounded retries (error-handling.md: "a job
// that exhausts retries is marked failed with its reason stored on the
// import record") — the system stays healthy, no row is left stuck
// "processing" forever.
export async function markImportFailed(db: Db, importId: number, reason: string): Promise<void> {
  await db
    .update(imports)
    .set({ status: 'failed', failureReason: reason, updatedAt: new Date() })
    .where(eq(imports.id, importId));
}
