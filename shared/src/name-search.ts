// One suggestion per published attempt. A name appearing in several years
// yields several separate, year-labeled suggestions — never merged.
import type { ExamType } from './exam-type';

export interface NameSearchSuggestion {
  // Public URL handle for this result page.
  slug: string;
  examType: ExamType;
  examYear: number;
  examNo: string;
  nameFr: string | null;
  nameAr: string | null;
  // null for Brevet (no track).
  serie: string | null;
}

export interface NameSearchResponse {
  data: {
    suggestions: NameSearchSuggestion[];
  };
}
