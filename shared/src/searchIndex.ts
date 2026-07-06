// Task 034 — Meilisearch visibility and reindex from the admin dashboard.
// Read-only inspection + a manual full-reindex trigger, reusing the same
// index builder (api/src/services/meiliIndex.ts) publish/delete already call.

import type { ExamType } from './exam-type';

export interface SearchIndexStatusResult {
  documentCount: number;
  isIndexing: boolean;
  healthy: boolean;
  searchableAttributes: string[];
  sortableAttributes: string[];
  filterableAttributes: string[];
}

export interface SearchIndexStatusResponse {
  data: SearchIndexStatusResult;
}

// One indexed document — mirrors meiliIndex.ts's AttemptDocument (one row per
// published attempt; `slug` is the same public_slug the document id IS).
export interface SearchIndexDocument {
  slug: string;
  importId: number;
  examType: ExamType;
  examYear: number;
  examNo: string;
  nameFr: string | null;
  nameAr: string | null;
  serie: string | null;
}

export interface SearchIndexDocumentsResult {
  documents: SearchIndexDocument[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SearchIndexDocumentsResponse {
  data: SearchIndexDocumentsResult;
}

export interface SearchIndexReindexResult {
  documentCount: number;
}

export interface SearchIndexReindexResponse {
  data: SearchIndexReindexResult;
}
