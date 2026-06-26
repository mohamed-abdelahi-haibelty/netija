export interface StudentAttempt {
  examYear: number;
  examNo: string;
  serie: string;
  moyenne: string | null;
  decision: string;
  decisionRaw: string | null;
  school: string | null;
  wilaya: string | null;
}

export interface SeeAlsoEntry {
  personId: string;
  nameFr: string | null;
  nameAr: string | null;
  examYear: number;
  examNo: string;
}

export interface StudentPageData {
  personId: string;
  nameFr: string | null;
  nameAr: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  attempts: StudentAttempt[];
  seeAlso: SeeAlsoEntry[];
}

export interface StudentPageResponse {
  data: StudentPageData;
}
