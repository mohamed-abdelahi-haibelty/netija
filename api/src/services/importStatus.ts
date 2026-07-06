import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { imports } from '../db/schema.js';
import type { ImportStatusResult } from 'shared';

// Reads the import's full lifecycle state for the admin dashboard: state,
// progress, summary (once the job has produced one), smoke result, publish
// flag, and failure reason. Returns null when the import id doesn't exist
// (route -> 404).
export async function getImportStatus(db: Db, importId: number): Promise<ImportStatusResult | null> {
  const [row] = await db
    .select({
      originalFilename: imports.originalFilename,
      status: imports.status,
      examYear: imports.examYear,
      progress: imports.progress,
      summaryInserted: imports.summaryInserted,
      summaryRejected: imports.summaryRejected,
      summaryDuplicatesSkipped: imports.summaryDuplicatesSkipped,
      smokePassed: imports.smokePassed,
      published: imports.published,
      failureReason: imports.failureReason,
    })
    .from(imports)
    .where(eq(imports.id, importId))
    .limit(1);
  if (!row) return null;

  const summary =
    row.summaryInserted === null
      ? null
      : {
          inserted: row.summaryInserted,
          rejected: row.summaryRejected ?? 0,
          duplicatesSkipped: row.summaryDuplicatesSkipped ?? 0,
        };

  return {
    originalFilename: row.originalFilename,
    status: row.status,
    examYear: row.examYear,
    progress: row.progress,
    summary,
    smokePassed: row.smokePassed,
    published: row.published,
    failureReason: row.failureReason,
  };
}
