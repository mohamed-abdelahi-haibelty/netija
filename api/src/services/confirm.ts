import { and, eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import type { Db } from '../db/client.js';
import { imports, columnAliases } from '../db/schema.js';
import type { ImportJobData } from '../lib/queue.js';
import { IMPORT_JOB_ATTEMPTS, IMPORT_JOB_BACKOFF_MS } from '../lib/queue.js';
import type { CanonicalField, ImportConfirmPayload, ImportConfirmResult } from 'shared';

// Thrown when the submitted mapping doesn't satisfy the guaranteed floor
// (an exam_no column and at least one name column) — mirrors
// worker/mapping.py's passes_floor check on the Python side. The route
// turns this into 422 MISSING_REQUIRED_COLUMNS.
export class MissingRequiredColumnsError extends Error {
  constructor(public readonly missing: ReadonlyArray<'exam_no' | 'name'>) {
    super(`Mapping is missing required column(s): ${missing.join(', ')}.`);
    this.name = 'MissingRequiredColumnsError';
  }
}

function checkFloor(mapping: Record<string, CanonicalField>): Array<'exam_no' | 'name'> {
  const mapped = new Set(Object.values(mapping));
  const missing: Array<'exam_no' | 'name'> = [];
  if (!mapped.has('exam_no')) missing.push('exam_no');
  if (!mapped.has('name_fr') && !mapped.has('name_ar')) missing.push('name');
  return missing;
}

// Every confirmed header -> field pair is learned so the next preview of the
// same headers auto-maps them (testing.md: "a confirmed manual remap is
// persisted to column_aliases"). Upsert keeps this idempotent across repeat
// confirms of the same import.
async function persistLearnedAliases(
  db: Db,
  mapping: Record<string, CanonicalField>,
): Promise<void> {
  const entries = Object.entries(mapping);
  for (const [rawHeader, canonicalField] of entries) {
    await db
      .insert(columnAliases)
      .values({ rawHeader, canonicalField })
      .onConflictDoUpdate({ target: columnAliases.rawHeader, set: { canonicalField } });
  }
}

// Validates the mapping/year payload, persists manual corrections as learned
// aliases, and enqueues exactly one BullMQ job. Returns null when the import
// id doesn't exist (route -> 404). The pending -> processing transition is
// an atomic, conditional UPDATE: only the confirm call that actually flips
// the row enqueues a job, so a duplicate confirm (retry, double-click,
// concurrent request) never enqueues a second one — the same
// upsert/ON-CONFLICT idea code-standards.md asks for on any write that can
// conflict, applied via a conditional WHERE instead.
export async function confirmImport(
  db: Db,
  queue: Queue<ImportJobData>,
  importId: number,
  payload: ImportConfirmPayload,
): Promise<ImportConfirmResult | null> {
  const [existing] = await db
    .select({ id: imports.id, status: imports.status })
    .from(imports)
    .where(eq(imports.id, importId))
    .limit(1);
  if (!existing) return null;

  const missing = checkFloor(payload.mapping);
  if (missing.length > 0) {
    throw new MissingRequiredColumnsError(missing);
  }

  await persistLearnedAliases(db, payload.mapping);

  const [claimed] = await db
    .update(imports)
    .set({
      status: 'processing',
      examType: payload.examType,
      examYear: payload.examYear,
      progress: 0,
      updatedAt: new Date(),
    })
    .where(and(eq(imports.id, importId), eq(imports.status, 'pending')))
    .returning({ id: imports.id, status: imports.status });

  if (!claimed) {
    // Already confirmed by an earlier call: report its current status
    // (unchanged by the no-op UPDATE above) without enqueuing a second job.
    return { status: existing.status };
  }

  await queue.add(
    'process-import',
    { importId, examType: payload.examType, examYear: payload.examYear, mapping: payload.mapping },
    {
      jobId: `import-${String(importId)}`,
      attempts: IMPORT_JOB_ATTEMPTS,
      backoff: { type: 'exponential', delay: IMPORT_JOB_BACKOFF_MS },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );

  return { status: claimed.status };
}
