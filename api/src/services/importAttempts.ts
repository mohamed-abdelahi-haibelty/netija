import { and, asc, count, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { RedisClient } from '../lib/redis.js';
import type { MeiliClient } from '../lib/meili.js';
import { attempts, imports } from '../db/schema.js';
import { buildNameIndex } from './meiliIndex.js';
import { ImportProcessingError } from './deleteImport.js';
import { examCacheKey } from './examSearch.js';
import { resultCacheKey } from './studentPage.js';
import type { ImportAttemptsDeleteResult, ImportAttemptsListResult } from 'shared';
import type { ListImportAttemptsQuery } from '../schemas/attempts.js';

// Search matches either name column (French or Arabic) or the exam number,
// substring, case-insensitive — a 50k-row ILIKE scan is well within an
// admin dashboard's latency budget and this table is never queried publicly.
function buildWhere(importId: number, params: Pick<ListImportAttemptsQuery, 'search' | 'serie' | 'decision'>) {
  const conditions: (SQL | undefined)[] = [eq(attempts.importId, importId)];
  if (params.serie) conditions.push(eq(attempts.serie, params.serie));
  if (params.decision) conditions.push(eq(attempts.decision, params.decision));
  if (params.search) {
    const pattern = `%${params.search}%`;
    conditions.push(
      or(ilike(attempts.nameFr, pattern), ilike(attempts.nameAr, pattern), ilike(attempts.examNo, pattern)),
    );
  }
  return and(...conditions);
}

// Paginated, server-side-filtered listing of one import's attempts (task
// 033) — built for imports up to ~50k rows, so the admin table never loads
// everything at once. Returns null when the import id doesn't exist (route
// -> 404); an existing import with no matching rows still returns 200 with
// an empty page.
export async function listImportAttempts(
  db: Db,
  importId: number,
  params: ListImportAttemptsQuery,
): Promise<ImportAttemptsListResult | null> {
  const [importRow] = await db.select({ id: imports.id }).from(imports).where(eq(imports.id, importId)).limit(1);
  if (!importRow) return null;

  const where = buildWhere(importId, params);

  const [totalRow] = await db.select({ value: count() }).from(attempts).where(where);
  const total = totalRow?.value ?? 0;

  const rows = await db
    .select({
      id: attempts.id,
      examNo: attempts.examNo,
      nameFr: attempts.nameFr,
      nameAr: attempts.nameAr,
      serie: attempts.serie,
      moyenne: attempts.moyenne,
      decision: attempts.decision,
    })
    .from(attempts)
    .where(where)
    .orderBy(asc(attempts.examNo))
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);

  // Every serie in this import, unaffected by the current filters, so the
  // filter dropdown's own options never shrink as an admin narrows results.
  const seriesRows = await db
    .selectDistinct({ serie: attempts.serie })
    .from(attempts)
    .where(eq(attempts.importId, importId))
    .orderBy(asc(attempts.serie));

  return {
    rows,
    total,
    page: params.page,
    pageSize: params.pageSize,
    // Brevet imports have no serie (null), so those are dropped — the filter
    // dropdown only ever offers real track values.
    availableSeries: seriesRows.map((r) => r.serie).filter((s): s is string => s !== null),
  };
}

// Deletes one or several attempt rows within an import — a single delete is
// just a one-element `attemptIds`. Each deletion fans out to DB + Meilisearch
// + Redis so nothing is left as a "ghost" in a derived store (architecture.md
// invariant 6). Guarded the same way deleteImport.ts guards whole-import
// deletion: a processing or cancelling import may still be writing/rolling
// back rows on a different connection, so row-level deletes would race it.
// Returns null when the import id doesn't exist (route -> 404).
export async function deleteImportAttempts(
  db: Db,
  meili: MeiliClient,
  redis: RedisClient,
  importId: number,
  attemptIds: number[],
): Promise<ImportAttemptsDeleteResult | null> {
  const [existing] = await db
    .select({ id: imports.id, status: imports.status, summaryInserted: imports.summaryInserted })
    .from(imports)
    .where(eq(imports.id, importId))
    .limit(1);
  if (!existing) return null;

  if (existing.status === 'processing' || existing.status === 'cancelling') {
    throw new ImportProcessingError();
  }

  // Scoped to this import's own attempts: an id belonging to a different
  // import (or one that doesn't exist) is silently ignored rather than
  // erroring, so a stale client-side selection can't delete someone else's
  // rows or blow up on a row deleted a moment ago by another admin.
  const targetRows = await db
    .select({
      id: attempts.id,
      examType: attempts.examType,
      examYear: attempts.examYear,
      examNo: attempts.examNo,
      slug: attempts.publicSlug,
    })
    .from(attempts)
    .where(and(eq(attempts.importId, importId), inArray(attempts.id, attemptIds)));

  if (targetRows.length === 0) {
    return { deletedAttempts: 0 };
  }

  const ids = targetRows.map((r) => r.id);

  await db.transaction(async (tx) => {
    await tx.delete(attempts).where(inArray(attempts.id, ids));
    // Keep the stored summary in sync with what's actually left — otherwise
    // the status/publish page would keep showing a stale "N inserted" count
    // that no longer matches the real row count for this import.
    if (existing.summaryInserted !== null) {
      await tx
        .update(imports)
        .set({ summaryInserted: existing.summaryInserted - targetRows.length, updatedAt: new Date() })
        .where(eq(imports.id, importId));
    }
  });

  const pipeline = redis.pipeline();
  for (const row of targetRows) {
    pipeline.del(examCacheKey(row.examType, row.examYear, row.examNo));
    pipeline.del(resultCacheKey(row.slug));
  }
  await pipeline.exec();

  // Meilisearch has no per-document-set partial delete wired up here; a full
  // rebuild from Postgres is the same always-correct pattern deleteImport.ts
  // and publish.ts already use (a no-op if this import isn't published,
  // since only published attempts are ever indexed).
  await buildNameIndex(db, meili);

  return { deletedAttempts: targetRows.length };
}
