import type { ExamType } from './exam-type';

export interface ExamSearchResult {
  // Public URL handle for the matched result page.
  slug: string;
  examType: ExamType;
  nameFr: string | null;
  nameAr: string | null;
  examNo: string;
  examYear: number;
  decision: string;
  moyenne: string | null;
  // null for Brevet (no track).
  serie: string | null;
}

export interface PublishedYearsResponse {
  data: { years: number[] };
}
