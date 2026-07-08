import type { RedisClient } from '../lib/redis.js';
import { examCacheKey } from './examSearch.js';
import { resultCacheKey } from './studentPage.js';
import type { ExamType } from 'shared';

export interface CachedAttemptKeys {
  examType: ExamType;
  examYear: number;
  examNo: string;
  slug: string;
}

// Shared by publish.ts, deleteImport.ts, and importAttempts.ts: every
// attempt row has its own Redis cache entries (exam-number lookup + result
// page); pipelined rather than deleted one round trip at a time, since a
// 50k-row import means tens of thousands of keys. Callers decide separately
// whether the years-list cache also needs invalidating (row-level deletes
// don't change an import's publish/year status, so importAttempts.ts
// deliberately doesn't call that one).
export async function invalidateAttemptCaches(redis: RedisClient, rows: CachedAttemptKeys[]): Promise<void> {
  if (rows.length === 0) return;
  const pipeline = redis.pipeline();
  for (const row of rows) {
    pipeline.del(examCacheKey(row.examType, row.examYear, row.examNo));
    pipeline.del(resultCacheKey(row.slug));
  }
  await pipeline.exec();
}
