export interface ExamSearchResult {
  // Public URL handle for the matched result page.
  slug: string;
  nameFr: string | null;
  nameAr: string | null;
  examNo: string;
  examYear: number;
  decision: string;
  moyenne: string | null;
  serie: string;
}

export interface ExamSearchResponse {
  data: ExamSearchResult;
}

export interface PublishedYearsResponse {
  data: { years: number[] };
}
