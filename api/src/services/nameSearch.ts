import type { MeiliClient } from '../lib/meili.js';
import { ATTEMPTS_INDEX } from '../lib/meili.js';
import type { NameSearchSuggestion } from 'shared';

const MAX_RESULTS = 10;

// The Meili document id IS the attempt's public slug.
interface AttemptDocument {
  id: string;
  examYear: number;
  examNo: string;
  nameFr: string | null;
  nameAr: string | null;
  serie: string;
}

export async function searchByName(
  meili: MeiliClient,
  query: string,
): Promise<NameSearchSuggestion[]> {
  const index = meili.index<AttemptDocument>(ATTEMPTS_INDEX);
  const results = await index.search(query, {
    limit: MAX_RESULTS,
    sort: ['examYear:desc'],
  });

  return results.hits.map((hit) => ({
    slug: hit.id,
    examYear: hit.examYear,
    examNo: hit.examNo,
    nameFr: hit.nameFr,
    nameAr: hit.nameAr,
    serie: hit.serie,
  }));
}
