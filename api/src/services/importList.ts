import { desc } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { imports } from '../db/schema.js';
import type { ImportListItem } from 'shared';

// Every import for the admin dashboard (task 024), newest upload first — an
// admin mid-results-day cares most about what's happening right now, which
// is always the most recent row.
export async function listImports(db: Db): Promise<ImportListItem[]> {
  const rows = await db
    .select({
      id: imports.id,
      originalFilename: imports.originalFilename,
      examType: imports.examType,
      examYear: imports.examYear,
      status: imports.status,
      progress: imports.progress,
      summaryInserted: imports.summaryInserted,
      summaryRejected: imports.summaryRejected,
      summaryDuplicatesSkipped: imports.summaryDuplicatesSkipped,
      smokePassed: imports.smokePassed,
      published: imports.published,
      failureReason: imports.failureReason,
      createdAt: imports.createdAt,
    })
    .from(imports)
    .orderBy(desc(imports.createdAt));

  return rows.map((row) => ({
    id: row.id,
    originalFilename: row.originalFilename,
    examType: row.examType,
    examYear: row.examYear,
    status: row.status,
    progress: row.progress,
    summary:
      row.summaryInserted === null
        ? null
        : {
            inserted: row.summaryInserted,
            rejected: row.summaryRejected ?? 0,
            duplicatesSkipped: row.summaryDuplicatesSkipped ?? 0,
          },
    smokePassed: row.smokePassed,
    published: row.published,
    failureReason: row.failureReason,
    createdAt: row.createdAt.toISOString(),
  }));
}
