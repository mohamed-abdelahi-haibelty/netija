import { eq, and } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { RedisClient } from '../lib/redis.js';
import { attempts, imports } from '../db/schema.js';
import type { StudentResult } from 'shared';

const STUDENT_CACHE_TTL = 3600;

export function resultCacheKey(slug: string): string {
  return `result:${slug}`;
}

// Shared by getStudentPage and getAdminResultPreview — same 9-column
// projection, differing only in whether the published filter is applied.
const STUDENT_RESULT_COLUMNS = {
  slug: attempts.publicSlug,
  examType: attempts.examType,
  examYear: attempts.examYear,
  examNo: attempts.examNo,
  nameFr: attempts.nameFr,
  nameAr: attempts.nameAr,
  serie: attempts.serie,
  moyenne: attempts.moyenne,
  decision: attempts.decision,
  decisionRaw: attempts.decisionRaw,
};

// The public result page is addressed by `slug` (a random, non-enumerable
// handle). Internally a result is still one attempt row keyed by
// (exam_year, exam_no); the slug is just the public alias. Only published
// attempts are returned.
export async function getStudentPage(
  db: Db,
  redis: RedisClient,
  slug: string,
): Promise<StudentResult | null> {
  const cacheKey = resultCacheKey(slug);
  const cached = await redis.get(cacheKey);
  if (cached !== null) return JSON.parse(cached) as StudentResult;

  const rows = await db
    .select(STUDENT_RESULT_COLUMNS)
    .from(attempts)
    .innerJoin(imports, eq(imports.id, attempts.importId))
    .where(and(eq(attempts.publicSlug, slug), eq(imports.published, true)))
    .limit(1);

  const [result] = rows;
  if (!result) return null;

  await redis.set(cacheKey, JSON.stringify(result), 'EX', STUDENT_CACHE_TTL);
  return result;
}

// Auth-gated admin lookup (architecture.md: "auth-gated admin preview can see
// unpublished data"): the same attempt-by-slug query as getStudentPage but
// without the `imports.published` filter, and never touching the public
// result cache — admins previewing an unpublished year must always see live
// DB state, not a stale (or wrongly-shared) cache entry.
export async function getAdminResultPreview(db: Db, slug: string): Promise<StudentResult | null> {
  const rows = await db
    .select(STUDENT_RESULT_COLUMNS)
    .from(attempts)
    .innerJoin(imports, eq(imports.id, attempts.importId))
    .where(eq(attempts.publicSlug, slug))
    .limit(1);

  const [row] = rows;
  return row ?? null;
}
