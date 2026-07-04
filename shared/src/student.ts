// A "result" is a single attempt. There is no person concept, no cross-year
// history, and no "other records with this name" section. The public result
// page is addressed by `slug` (a random, non-enumerable handle); the internal
// identity remains (examYear, examNo).
export interface StudentResult {
  slug: string;
  examYear: number;
  examNo: string;
  nameFr: string | null;
  nameAr: string | null;
  serie: string;
  moyenne: string | null;
  decision: string;
  decisionRaw: string | null;
}

export interface StudentPageResponse {
  data: StudentResult;
}
