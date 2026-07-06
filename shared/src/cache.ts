// Task 035 — Redis result-cache visibility and invalidation from the admin
// dashboard. Deliberately scoped to the two result-cache key families
// (examSearch.ts's `exam:{year}:{examNo}` and studentPage.ts's
// `result:{slug}`) — never rate-limit counters or BullMQ's own keys.

export interface CacheStatusResult {
  examKeyCount: number;
  resultKeyCount: number;
  totalKeyCount: number;
}

export interface CacheStatusResponse {
  data: CacheStatusResult;
}

export interface CacheKeyEntry {
  key: string;
  ttl: number;
}

export interface CacheKeysListResult {
  keys: CacheKeyEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CacheKeysListResponse {
  data: CacheKeysListResult;
}

export interface CacheKeyInspectResult {
  key: string;
  ttl: number;
  value: unknown;
}

export interface CacheKeyInspectResponse {
  data: CacheKeyInspectResult;
}

export interface CacheInvalidateResult {
  deleted: boolean;
}

export interface CacheInvalidateResponse {
  data: CacheInvalidateResult;
}

export interface CacheFlushResult {
  deletedCount: number;
}

export interface CacheFlushResponse {
  data: CacheFlushResult;
}
