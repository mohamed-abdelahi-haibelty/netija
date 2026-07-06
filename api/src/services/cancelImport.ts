import { and, eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import type { Db } from '../db/client.js';
import { imports } from '../db/schema.js';
import type { ImportJobData } from '../lib/queue.js';
import type { ImportCancelResult } from 'shared';

// Grace period between SIGTERM and a forceful SIGKILL escalation, for a
// process that isn't reaching one of loader.py's cooperative cancellation
// checkpoints (e.g. still inside pd.read_excel on a huge file, or
// genuinely stuck). Short, since an admin-triggered cancel is meant to be
// fast, and worker.py has no SIGTERM handler of its own — Python's default
// action already terminates it almost immediately in the common case.
export const FORCE_KILL_GRACE_MS = 3000;

// Thrown when the import isn't in a state cancellation applies to (already
// completed/failed/cancelled, or the atomic claim below lost a race with
// another cancel request). The route turns this into 409
// IMPORT_NOT_CANCELLABLE.
export class ImportNotCancellableError extends Error {
  constructor() {
    super('This import cannot be cancelled — it is not currently processing.');
    this.name = 'ImportNotCancellableError';
  }
}

// Cancels a running/stuck import (task 032). Returns null when the import
// id doesn't exist (route -> 404); throws ImportNotCancellableError when
// it exists but isn't `processing` (route -> 409).
//
// Two paths, depending on whether worker.py has actually been spawned yet:
//   - Job still waiting/delayed in BullMQ (never spawned Python): nothing
//     to signal and nothing could have been written yet, so this finalizes
//     to 'cancelled' immediately.
//   - Job active (Python is running): flips to 'cancelling', which
//     loader.py polls for once per batch and aborts on (rolling back its
//     whole not-yet-committed transaction — see loader.py's
//     ImportCancelled). A recorded worker pid also gets SIGTERM right away,
//     with a SIGKILL escalation if the process is still alive shortly
//     after — the fallback for a run stuck between two checkpoints. Either
//     way, importJob.ts is what finalizes the row to 'cancelled' once the
//     process actually stops; the dashboard observes that transition via
//     its existing status poll.
export async function cancelImport(
  db: Db,
  queue: Queue<ImportJobData>,
  importId: number,
): Promise<ImportCancelResult | null> {
  const [existing] = await db
    .select({ id: imports.id, status: imports.status })
    .from(imports)
    .where(eq(imports.id, importId))
    .limit(1);
  if (!existing) return null;

  const [claimed] = await db
    .update(imports)
    .set({ status: 'cancelling', updatedAt: new Date() })
    .where(and(eq(imports.id, importId), eq(imports.status, 'processing')))
    .returning({ id: imports.id });

  if (!claimed) {
    throw new ImportNotCancellableError();
  }

  const job = await queue.getJob(`import-${String(importId)}`);
  const active = job ? await job.isActive() : false;

  if (!active) {
    // Never spawned Python (still waiting/delayed) or already gone —
    // nothing was ever written for this run.
    if (job) await job.remove();
    await db.update(imports).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(imports.id, importId));
    return { status: 'cancelled' };
  }

  const [{ workerPid } = { workerPid: null }] = await db
    .select({ workerPid: imports.workerPid })
    .from(imports)
    .where(eq(imports.id, importId))
    .limit(1);

  if (workerPid) {
    scheduleForceKill(db, importId, workerPid);
  }

  return { status: 'cancelling' };
}

function scheduleForceKill(db: Db, importId: number, pid: number): void {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return; // already gone
  }

  setTimeout(() => {
    void (async () => {
      const [current] = await db
        .select({ status: imports.status, workerPid: imports.workerPid })
        .from(imports)
        .where(eq(imports.id, importId))
        .limit(1);
      // Still cancelling AND still the same pid we signalled -> the
      // cooperative check didn't stop it in time; escalate.
      if (current?.status === 'cancelling' && current.workerPid === pid) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // already exited
        }
      }
    })();
  }, FORCE_KILL_GRACE_MS).unref();
}
