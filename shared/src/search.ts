export interface ExamSearchResult {
  personId: string;
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
