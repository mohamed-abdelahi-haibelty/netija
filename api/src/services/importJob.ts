import { eq } from 'drizzle-orm';
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
  await db
    .update(imports)
    .set({ status: 'processing', progress: 0, updatedAt: new Date() })
    .where(eq(imports.id, data.importId));

  const stdout = await runPythonScript(PYTHON_BIN, WORKER_SCRIPT, [
    '--file-id',
    String(data.importId),
    '--exam-year',
    String(data.examYear),
    '--mapping',
    JSON.stringify(data.mapping),
  ]);

  const output = JSON.parse(stdout.trim()) as PythonWorkerSuccess | PythonWorkerFailure;
  if (!output.ok) {
    throw new ImportJobError(output.code, output.reason);
  }

  await db
    .update(imports)
    .set({
      status: 'completed',
      progress: 100,
      summaryInserted: output.inserted,
      summaryRejected: output.rejected,
      summaryDuplicatesSkipped: output.duplicates_skipped,
      failureReason: null,
      updatedAt: new Date(),
    })
    .where(eq(imports.id, data.importId));

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
