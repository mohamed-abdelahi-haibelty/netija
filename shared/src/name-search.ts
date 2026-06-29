export interface NameSearchSuggestion {
  personId: string;
  nameFr: string | null;
  nameAr: string | null;
  latestYear: number;
  serie: string;
  birthPlace: string | null;
}

export interface NameSearchResponse {
  data: {
    suggestions: NameSearchSuggestion[];
  };
}
