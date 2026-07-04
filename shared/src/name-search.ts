// One suggestion per published attempt. A name appearing in several years
// yields several separate, year-labeled suggestions — never merged.
export interface NameSearchSuggestion {
  // Public URL handle for this result page.
  slug: string;
  examYear: number;
  examNo: string;
  nameFr: string | null;
  nameAr: string | null;
  serie: string;
}

export interface NameSearchResponse {
  data: {
    suggestions: NameSearchSuggestion[];
  };
}
