// A "result" is a single attempt. There is no person concept, no cross-year
// history, and no "other records with this name" section. The public result
// page is addressed by `slug` (a random, non-enumerable handle); the internal
// identity remains (examYear, examNo).
import type { ExamType } from './exam-type';

export interface StudentResult {
  slug: string;
  examType: ExamType;
  examYear: number;
  examNo: string;
  nameFr: string | null;
  nameAr: string | null;
  // null for Brevet (no track); the result page omits the serie row entirely
  // for Brevet rather than rendering a blank field.
  serie: string | null;
  moyenne: string | null;
  decision: string;
  decisionRaw: string | null;
}

export interface StudentPageResponse {
  data: StudentResult;
}
