import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { MeiliClient } from '../lib/meili.js';
import { PERSONS_INDEX } from '../lib/meili.js';

// One document per person; the three disambiguators help the UI render
// distinguishable suggestions when two persons share the same name.
interface PersonDocument {
  id: string;
  nameFr: string | null;
  nameAr: string | null;
  latestYear: number;
  serie: string;
  birthPlace: string | null;
}

// DISTINCT ON keeps one row per person (the most recent published attempt).
// PostgreSQL evaluates ORDER BY (person_id, exam_year DESC) before deduplication,
// so "most recent" is guaranteed without a subquery.
const PUBLISHED_PERSONS_SQL = sql`
  SELECT DISTINCT ON (pl.person_id)
    pl.person_id::text   AS "personId",
    p.name_fr            AS "nameFr",
    p.name_ar            AS "nameAr",
    a.exam_year          AS "latestYear",
    a.serie,
    a.birth_place        AS "birthPlace"
  FROM attempts a
  JOIN person_links pl ON pl.attempt_id = a.id
  JOIN persons p       ON p.id = pl.person_id
  JOIN imports i       ON i.id = a.import_id
  WHERE i.published = true
  ORDER BY pl.person_id, a.exam_year DESC
`;

export async function buildNameIndex(db: Db, meili: MeiliClient): Promise<number> {
  const result = await db.execute(PUBLISHED_PERSONS_SQL);

  const docs: PersonDocument[] = result.rows.map((row) => ({
    id: row['personId'] as string,
    nameFr: (row['nameFr'] as string | null) ?? null,
    nameAr: (row['nameAr'] as string | null) ?? null,
    latestYear: row['latestYear'] as number,
    serie: row['serie'] as string,
    birthPlace: (row['birthPlace'] as string | null) ?? null,
  }));

  const index = meili.index<PersonDocument>(PERSONS_INDEX);

  await index.updateSettings({
    searchableAttributes: ['nameFr', 'nameAr'],
    sortableAttributes: ['latestYear'],
  });

  await index.deleteAllDocuments();
  await index.addDocuments(docs, { primaryKey: 'id' });

  return docs.length;
}
