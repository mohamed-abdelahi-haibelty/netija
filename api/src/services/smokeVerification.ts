import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { attempts, imports, rejects } from '../db/schema.js';
import { getAdminResultPreview } from './studentPage.js';

// Samples this many attempts at most; a small import (e.g. a rehearsal file)
// simply samples everything it has.
export const SMOKE_SAMPLE_SIZE = 20;

export interface SmokeResult {
  passed: boolean;
  reason: string | null;
}

// Results-day safety net (project-overview.md release flow): before an import
// can be published, prove the pipeline actually did what it reported, rather
// than trusting the worker's self-reported summary alone.
//
// Two independent checks:
// 1. Reconciliation — the summary counts recorded on the import row must
//    match what is actually in Postgres for that import (file rows =
//    inserted + rejected, per the task spec). A mismatch here means the
//    summary itself lied, which the sample check below couldn't catch.
// 2. Sample round-trip — a random sample of this import's attempts must come
//    back correctly through the same admin-preview lookup the dashboard uses
//    to inspect unpublished data. This exercises the real lookup path (not
//    just a second read of the same row), catching bugs like a wrong column
//    selected or the preview accidentally still filtering on `published`.
export async function runSmokeVerification(db: Db, importId: number): Promise<SmokeResult> {
  const [importRow] = await db
    .select({
      summaryInserted: imports.summaryInserted,
      summaryRejected: imports.summaryRejected,
    })
    .from(imports)
    .where(eq(imports.id, importId))
    .limit(1);
  if (!importRow) {
    return { passed: false, reason: 'Import not found.' };
  }

  const [insertedRow] = await db
    .select({ count: sql<string>`count(*)` })
    .from(attempts)
    .where(eq(attempts.importId, importId));
  const [rejectedRow] = await db
    .select({ count: sql<string>`count(*)` })
    .from(rejects)
    .where(eq(rejects.importId, importId));

  const actualInserted = Number(insertedRow?.count ?? 0);
  const actualRejected = Number(rejectedRow?.count ?? 0);
  const expectedInserted = importRow.summaryInserted ?? 0;
  const expectedRejected = importRow.summaryRejected ?? 0;

  if (actualInserted !== expectedInserted) {
    return {
      passed: false,
      reason: `Inserted count mismatch: summary says ${String(expectedInserted)}, Postgres has ${String(actualInserted)} attempts for this import.`,
    };
  }
  if (actualRejected !== expectedRejected) {
    return {
      passed: false,
      reason: `Rejected count mismatch: summary says ${String(expectedRejected)}, Postgres has ${String(actualRejected)} rejects for this import.`,
    };
  }

  const sample = await db
    .select({
      slug: attempts.publicSlug,
      examYear: attempts.examYear,
      examNo: attempts.examNo,
      nameFr: attempts.nameFr,
      nameAr: attempts.nameAr,
      moyenne: attempts.moyenne,
      decision: attempts.decision,
    })
    .from(attempts)
    .where(eq(attempts.importId, importId))
    .orderBy(sql`random()`)
    .limit(SMOKE_SAMPLE_SIZE);

  for (const row of sample) {
    const preview = await getAdminResultPreview(db, row.slug);
    const matches =
      preview !== null &&
      preview.examYear === row.examYear &&
      preview.examNo === row.examNo &&
      preview.nameFr === row.nameFr &&
      preview.nameAr === row.nameAr &&
      preview.moyenne === row.moyenne &&
      preview.decision === row.decision;

    if (!matches) {
      return {
        passed: false,
        reason: `Admin preview mismatch for exam_no ${row.examNo} (year ${String(row.examYear)}).`,
      };
    }
  }

  return { passed: true, reason: null };
}
