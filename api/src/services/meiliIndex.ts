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
  await index.addDocuments(docs, { primaryKey: 'id' });

  return docs.length;
}
