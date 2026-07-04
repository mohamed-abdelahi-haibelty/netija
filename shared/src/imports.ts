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

// The confirm payload: the admin's (possibly corrected) mapping plus the
// exam year for this file. Matches worker/mapping.py's shape — every header
// not listed here was left "— Ignore —" in the mapping UI.
export interface ImportConfirmPayload {
  mapping: Record<string, CanonicalField>;
  examYear: number;
}

export interface ImportConfirmResult {
  status: ImportStatus;
}

export interface ImportConfirmResponse {
  data: ImportConfirmResult;
}

// Mirrors the db's import_status enum (schema.ts) — the coarse lifecycle
// state a confirmed import moves through.
export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ImportSummary {
  inserted: number;
  rejected: number;
  duplicatesSkipped: number;
}

export interface ImportStatusResult {
  status: ImportStatus;
  examYear: number | null;
  // 0-100 while processing; null before the job has started.
  progress: number | null;
  // null until the job completes (successfully or not).
  summary: ImportSummary | null;
  smokePassed: boolean | null;
  published: boolean;
  failureReason: string | null;
}

export interface ImportStatusResponse {
  data: ImportStatusResult;
}

export interface ImportPublishResult {
  published: boolean;
}

export interface ImportPublishResponse {
  data: ImportPublishResult;
}
