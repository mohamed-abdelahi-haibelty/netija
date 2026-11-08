import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { MeiliClient } from '../lib/meili.js';
import { ATTEMPTS_INDEX } from '../lib/meili.js';

// One document per published attempt. The document id is the attempt's public
// `slug` — the same non-enumerable handle result-page links resolve on.
// `importId` isn't searched or displayed publicly; it exists so the admin
// index-inspection panel (task 034) can filter documents down to one import
// without guessing from examYear alone (an exam year can, in principle, be
// re-imported under a different import row). Exported so searchIndexAdmin.ts
// and nameSearch.ts share this one shape instead of each declaring their own.
export interface AttemptDocument {
  id: string;
  importId: number;
  examType: string;
  examYear: number;
  examNo: string;
  nameFr: string | null;
  nameAr: string | null;
  serie: string | null;
}

// One row per published attempt. A name appearing in several years produces
// several independent documents — there is no per-person deduplication.
// import_id is bigint in Postgres (returned as a string by node-postgres for
// raw queries); cast to int since import ids never approach int4 range.
const PUBLISHED_ATTEMPTS_SQL = sql`
  SELECT
    a.public_slug        AS "id",
    a.import_id::int     AS "importId",
    a.exam_type          AS "examType",
    a.exam_year           AS "examYear",
    a.exam_no             AS "examNo",
    a.name_fr             AS "nameFr",
    a.name_ar             AS "nameAr",
    a.serie
  FROM attempts a
  JOIN imports i ON i.id = a.import_id
  WHERE i.published = true
  ORDER BY a.exam_year DESC
`;

// Meilisearch rejects any single request over ~95 MiB (the incident this
// batches around: publishing every Bac year 2015-2025 plus a Brevet year
// pushed one unbatched addDocuments call over that ceiling). 5,000 keeps each
// request in the tens-to-low-hundreds of KB for this project's small, flat
// document shape, with large headroom to grow as more years/types publish.
// Named per code-standards.md ("every magic value ... is a named constant").
export const MEILI_INDEX_BATCH_SIZE = 5000;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function buildNameIndex(db: Db, meili: MeiliClient): Promise<number> {
  const result = await db.execute(PUBLISHED_ATTEMPTS_SQL);

  const docs: AttemptDocument[] = result.rows.map((row) => ({
    id: row['id'] as string,
    importId: row['importId'] as number,
    examType: row['examType'] as string,
    examYear: row['examYear'] as number,
    examNo: row['examNo'] as string,
    nameFr: (row['nameFr'] as string | null) ?? null,
    nameAr: (row['nameAr'] as string | null) ?? null,
    serie: (row['serie'] as string | null) ?? null,
  }));

  const index = meili.index<AttemptDocument>(ATTEMPTS_INDEX);

  await index.updateSettings({
    searchableAttributes: ['nameFr', 'nameAr'],
    sortableAttributes: ['examYear'],
    // examType is filterable so name search can scope to one exam (Bac vs
    // Brevet) — Bac and Brevet names must never intermingle in one autocomplete.
    filterableAttributes: ['importId', 'examType', 'examYear'],
  });

  await index.deleteAllDocuments();

  // Sequential, not Promise.all: predictable load, and a batch failure stops
  // at a known point and propagates as a normal thrown error (fail-fast) —
  // Meilisearch stays rebuildable from Postgres (architecture.md invariant
  // 6), so retrying the admin Reindex action fixes a short index.
  //
  // Known limitation, deliberately deferred (see progress-tracker.md for the
  // full writeup): deleteAllDocuments() still runs before re-adding, so a
  // search mid-rebuild can see an incomplete/empty index until every batch
  // lands. A zero-downtime build-into-a-staging-index-then-swapIndexes()
  // approach is possible but substantially bigger than batching alone.
  for (const batch of chunk(docs, MEILI_INDEX_BATCH_SIZE)) {
    await index.addDocuments(batch, { primaryKey: 'id' });
  }

  return docs.length;
}
