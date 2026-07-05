import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { RedisClient } from '../lib/redis.js';
import type { MeiliClient } from '../lib/meili.js';
import { attempts, imports, rejects } from '../db/schema.js';
import { buildNameIndex } from './meiliIndex.js';
import { examCacheKey, invalidateYearsCache } from './examSearch.js';
import { resultCacheKey } from './studentPage.js';
import type { ImportDeleteResult } from 'shared';

// Thrown by deleteImport when the import is currently processing (a running
// import must be cancelled first — task 032, not yet built — deleting
// mid-run would race the queue worker's own writes to the same rows). The
// route turns this into 409 IMPORT_PROCESSING.
export class ImportProcessingError extends Error {
  constructor() {
    super('Cannot delete an import while it is still processing. Cancel it first.');
    this.name = 'ImportProcessingError';
  }
}

// Deletes an import and everything it produced — its attempts, its rejects,
// and the import row itself — inside one transaction, so a mid-delete
// failure leaves nothing half-removed (mirrors the loader's own
// single-transaction guarantee). The original uploaded Excel file is
// deliberately kept on the uploads volume (code-standards.md: "never
// deleted by code") for audit/re-import. Returns null when the import id
// doesn't exist (route -> 404).
export async function deleteImport(
  db: Db,
  meili: MeiliClient,
  redis: RedisClient,
  importId: number,
): Promise<ImportDeleteResult | null> {
  const [existing] = await db
    .select({ id: imports.id, status: imports.status })
    .from(imports)
    .where(eq(imports.id, importId))
    .limit(1);
  if (!existing) return null;

  if (existing.status === 'processing') {
    throw new ImportProcessingError();
  }

  // Read the affected attempts' cache keys before deleting them — once the
  // transaction commits there's nothing left in Postgres to look them up by.
  const attemptRows = await db
    .select({ examYear: attempts.examYear, examNo: attempts.examNo, slug: attempts.publicSlug })
    .from(attempts)
    .where(eq(attempts.importId, importId));

  await db.transaction(async (tx) => {
    // attempts/rejects both reference imports.id with no ON DELETE cascade
    // (schema.ts), so they must go first.
    await tx.delete(attempts).where(eq(attempts.importId, importId));
    await tx.delete(rejects).where(eq(rejects.importId, importId));
    await tx.delete(imports).where(eq(imports.id, importId));
  });

  if (attemptRows.length > 0) {
    const pipeline = redis.pipeline();
    for (const row of attemptRows) {
      pipeline.del(examCacheKey(row.examYear, row.examNo));
      pipeline.del(resultCacheKey(row.slug));
    }
    await pipeline.exec();
  }
  await invalidateYearsCache(redis);

  // Meilisearch has no per-import partial delete; a full rebuild from
  // Postgres is the same always-correct pattern publish.ts already uses, and
  // it's what makes a published year's deletion actually update what's
  // publicly searchable.
  await buildNameIndex(db, meili);

  return { deletedAttempts: attemptRows.length };
}
