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
// state a confirmed import moves through. 'cancelling' is a transient state
// between a cancel request and the import actually stopping (task 032);
// 'cancelled' is terminal, like 'completed'/'failed'.
export type ImportStatus =
  | 'pending'
  | 'processing'
  | 'cancelling'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface ImportSummary {
  inserted: number;
  rejected: number;
  duplicatesSkipped: number;
}

export interface ImportStatusResult {
  originalFilename: string;
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

// One row per uploaded file for the admin imports dashboard (task 024) —
// the same lifecycle fields as ImportStatusResult, plus the identity and
// upload metadata a list view (rather than a single-import lookup) needs.
export interface ImportListItem {
  id: number;
  originalFilename: string;
  examYear: number | null;
  status: ImportStatus;
  progress: number | null;
  summary: ImportSummary | null;
  smokePassed: boolean | null;
  published: boolean;
  failureReason: string | null;
  createdAt: string;
}

export interface ImportListResponse {
  data: ImportListItem[];
}

// Result of deleting an import (task 031): the import row, its rejects, and
// every attempt it produced are gone; deletedAttempts is how many attempt
// rows were removed, for the admin UI's post-delete confirmation.
export interface ImportDeleteResult {
  deletedAttempts: number;
}

export interface ImportDeleteResponse {
  data: ImportDeleteResult;
}

// Result of requesting cancellation (task 032). 'cancelled' means the
// import never actually started running (still waiting in the queue) or
// had already finished processing, so it was finalized immediately.
// 'cancelling' means an active run is being stopped — the loader's
// cooperative check and/or a forceful process kill are in flight; the
// dashboard observes the eventual 'cancelled' transition via its existing
// status poll.
export interface ImportCancelResult {
  status: 'cancelling' | 'cancelled';
}

export interface ImportCancelResponse {
  data: ImportCancelResult;
}
