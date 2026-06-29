import type { MeiliClient } from '../lib/meili.js';
import { PERSONS_INDEX } from '../lib/meili.js';
import type { NameSearchSuggestion } from 'shared';

const MAX_RESULTS = 10;

interface PersonDocument {
  id: string;
  nameFr: string | null;
  nameAr: string | null;
  latestYear: number;
  serie: string;
  birthPlace: string | null;
}

export async function searchByName(
  meili: MeiliClient,
  query: string,
): Promise<NameSearchSuggestion[]> {
  const index = meili.index<PersonDocument>(PERSONS_INDEX);
  const results = await index.search(query, {
    limit: MAX_RESULTS,
    sort: ['latestYear:desc'],
  });

  return results.hits.map((hit) => ({
    personId: hit.id,
    nameFr: hit.nameFr,
    nameAr: hit.nameAr,
    latestYear: hit.latestYear,
    serie: hit.serie,
    birthPlace: hit.birthPlace,
  }));
}
