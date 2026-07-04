import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { MeiliClient } from '../lib/meili.js';
import { ATTEMPTS_INDEX } from '../lib/meili.js';

// One document per published attempt. The document id is the attempt's public
// `slug` — the same non-enumerable handle result-page links resolve on.
interface AttemptDocument {
  id: string;
  examYear: number;
  examNo: string;
  nameFr: string | null;
  nameAr: string | null;
  serie: string;
}

// One row per published attempt. A name appearing in several years produces
// several independent documents — there is no per-person deduplication.
const PUBLISHED_ATTEMPTS_SQL = sql`
  SELECT
    a.public_slug AS "id",
    a.exam_year   AS "examYear",
    a.exam_no     AS "examNo",
    a.name_fr     AS "nameFr",
    a.name_ar     AS "nameAr",
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
    examYear: row['examYear'] as number,
    examNo: row['examNo'] as string,
    nameFr: (row['nameFr'] as string | null) ?? null,
    nameAr: (row['nameAr'] as string | null) ?? null,
    serie: row['serie'] as string,
  }));

  const index = meili.index<AttemptDocument>(ATTEMPTS_INDEX);

  await index.updateSettings({
    searchableAttributes: ['nameFr', 'nameAr'],
    sortableAttributes: ['examYear'],
  });

  await index.deleteAllDocuments();
  await index.addDocuments(docs, { primaryKey: 'id' });

  return docs.length;
}
