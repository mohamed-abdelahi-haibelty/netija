import type { MeiliClient } from '../lib/meili.js';
import { ATTEMPTS_INDEX } from '../lib/meili.js';
import type { AttemptDocument } from './meiliIndex.js';
import type { ExamType, NameSearchSuggestion } from 'shared';

const MAX_RESULTS = 10;

export async function searchByName(
  meili: MeiliClient,
  query: string,
  examType: ExamType,
): Promise<NameSearchSuggestion[]> {
  const index = meili.index<AttemptDocument>(ATTEMPTS_INDEX);
  // examType is a fixed enum from validated input — safe to interpolate into
  // the filter. Scoping here is what keeps Bac and Brevet names from ever
  // intermingling in one autocomplete.
  const results = await index.search(query, {
    limit: MAX_RESULTS,
    sort: ['examYear:desc'],
    filter: `examType = ${examType}`,
  });

  return results.hits.map((hit) => ({
    slug: hit.id,
    // The index is filtered to this exact examType above, and only ever
    // stores the two real exam types — this cast just narrows the shared
    // document's plain-string field back to the enum.
    examType: hit.examType as ExamType,
    examYear: hit.examYear,
    examNo: hit.examNo,
    nameFr: hit.nameFr,
    nameAr: hit.nameAr,
    serie: hit.serie,
  }));
}
