import type { ExamType } from './exam-type';

export interface ImportUploadResult {
  importId: number;
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

// The confirm payload: the admin's (possibly corrected) mapping plus the
// exam type and year for this file. Matches worker/mapping.py's shape — every
// header not listed here was left "— Ignore —" in the mapping UI.
export interface ImportConfirmPayload {
  mapping: Record<string, CanonicalField>;
  examType: ExamType;
  examYear: number;
}

export interface ImportConfirmResult {
  status: ImportStatus;
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
  // null until the import is confirmed (the admin picks type + year together).
  examType: ExamType | null;
  examYear: number | null;
  // 0-100 while processing; null before the job has started.
  progress: number | null;
  // null until the job completes (successfully or not).
  summary: ImportSummary | null;
  smokePassed: boolean | null;
  published: boolean;
  failureReason: string | null;
}

export interface ImportPublishResult {
  published: boolean;
}

// One row per uploaded file for the admin imports dashboard (task 024) —
// the same lifecycle fields as ImportStatusResult, plus the identity and
// upload metadata a list view (rather than a single-import lookup) needs.
export interface ImportListItem {
  id: number;
  originalFilename: string;
  examType: ExamType | null;
  examYear: number | null;
  status: ImportStatus;
  progress: number | null;
  summary: ImportSummary | null;
  smokePassed: boolean | null;
  published: boolean;
  failureReason: string | null;
  createdAt: string;
}

// Result of deleting an import (task 031): the import row, its rejects, and
// every attempt it produced are gone; deletedAttempts is how many attempt
// rows were removed, for the admin UI's post-delete confirmation.
export interface ImportDeleteResult {
  deletedAttempts: number;
}

// All 6 canonical decision values (mirrors api/src/db/schema.ts's
// decisionEnum) — duplicated here because shared/ has no dependency on the
// api's Drizzle schema; the admin rows filter dropdown (task 033) needs the
// full fixed list regardless of what's present in any one import.
export const DECISIONS = ['Admis', 'Ajourné', 'Sessionnaire', 'Absent', 'Délibérable', 'Annulé'] as const;
export type Decision = (typeof DECISIONS)[number];

// One row in an import's attempts table (task 033 — browse/filter/delete
// rows within an import). Deliberately excludes publicSlug: never needed by
// the admin table UI, and not worth exposing beyond what's displayed.
export interface ImportAttemptRow {
  id: number;
  examNo: string;
  nameFr: string | null;
  nameAr: string | null;
  // null for Brevet rows (no track).
  serie: string | null;
  moyenne: string | null;
  decision: string;
}

export interface ImportAttemptsListResult {
  rows: ImportAttemptRow[];
  total: number;
  page: number;
  pageSize: number;
  // Distinct serie values present anywhere in this import (not affected by
  // the current search/filter), so the filter dropdown's options don't
  // shrink as an admin narrows the table down.
  availableSeries: string[];
}

// Result of deleting one or several attempt rows within an import (task
// 033) — a single attempt is just a one-element selection through the same
// endpoint. deletedAttempts is how many rows actually matched and were
// removed, for the confirmation UI's outcome message.
export interface ImportAttemptsDeleteResult {
  deletedAttempts: number;
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
