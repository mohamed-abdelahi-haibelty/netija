export interface ImportUploadResult {
  importId: number;
}

export interface ImportUploadResponse {
  data: ImportUploadResult;
}

// The only fields the pipeline ever stores (see architecture.md's minimal
// data model) — the single set of remap targets the admin can choose from.
export type CanonicalField = 'exam_no' | 'name_fr' | 'name_ar' | 'serie' | 'moyenne' | 'decision';

// A file is only guaranteed to carry an exam number and at least one name
// column; "name" covers either name_fr or name_ar (see worker/mapping.py).
export type MissingRequiredField = 'exam_no' | 'name';

export type ImportPreviewColumnStatus = 'mapped' | 'ignored' | 'unrecognized';

export interface ImportPreviewColumn {
  header: string;
  canonicalField: CanonicalField | null;
  status: ImportPreviewColumnStatus;
  // Set only when status is 'ignored' — e.g. 'nni', 'birth_date',
  // 'birth_place' — the semantic reason the column is recognized but never
  // stored, per architecture.md's privacy invariants.
  ignoredCategory: string | null;
  samples: string[];
}

export interface ImportPreviewResult {
  columns: ImportPreviewColumn[];
  missingRequired: MissingRequiredField[];
}

export interface ImportPreviewResponse {
  data: ImportPreviewResult;
}
