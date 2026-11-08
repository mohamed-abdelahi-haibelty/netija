import { eq, and } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { RedisClient } from '../lib/redis.js';
import { attempts, imports } from '../db/schema.js';
import { EXAM_TYPES, type ExamSearchResult, type ExamType } from 'shared';

const EXAM_CACHE_TTL = 300;
const YEARS_CACHE_TTL = 3600;

// Namespaced by exam_type: a Bac and a Brevet candidate can share
// (year, exam_no), so their cache entries must never collide.
export function examCacheKey(examType: ExamType, year: number, examNo: string): string {
  return `exam:${examType}:${String(year)}:${examNo}`;
}

export function yearsCacheKey(examType: ExamType): string {
  return `years:published:${examType}`;
}

export async function searchByExamNo(
  db: Db,
  redis: RedisClient,
  examType: ExamType,
  examNo: string,
  year: number,
): Promise<ExamSearchResult | null> {
  const cacheKey = examCacheKey(examType, year, examNo);
  const cached = await redis.get(cacheKey);
  if (cached !== null) {
    return JSON.parse(cached) as ExamSearchResult;
  }

  const rows = await db
    .select({
      slug: attempts.publicSlug,
      examType: attempts.examType,
      nameFr: attempts.nameFr,
      nameAr: attempts.nameAr,
      examNo: attempts.examNo,
      examYear: attempts.examYear,
      decision: attempts.decision,
      moyenne: attempts.moyenne,
      serie: attempts.serie,
    })
    .from(attempts)
    .innerJoin(imports, eq(imports.id, attempts.importId))
    .where(
      and(
        eq(attempts.examType, examType),
        eq(attempts.examYear, year),
        eq(attempts.examNo, examNo),
        eq(imports.published, true),
      ),
    )
    .limit(1);

  const [row] = rows;
  if (!row) return null;
  const result: ExamSearchResult = {
    slug: row.slug,
    examType: row.examType,
    nameFr: row.nameFr,
    nameAr: row.nameAr,
    examNo: row.examNo,
    examYear: row.examYear,
    decision: row.decision,
    moyenne: row.moyenne,
    serie: row.serie,
  };

  await redis.set(cacheKey, JSON.stringify(result), 'EX', EXAM_CACHE_TTL);
  return result;
}

export async function getPublishedYears(
  db: Db,
  redis: RedisClient,
  examType: ExamType,
): Promise<number[]> {
  const cached = await redis.get(yearsCacheKey(examType));
  if (cached !== null) {
    return JSON.parse(cached) as number[];
  }

  const rows = await db
    .selectDistinct({ year: imports.examYear })
    .from(imports)
    .where(and(eq(imports.published, true), eq(imports.examType, examType)));

  const years = rows
    .map((r) => r.year)
    .filter((y): y is number => y !== null)
    .sort((a, b) => b - a);

  await redis.set(yearsCacheKey(examType), JSON.stringify(years), 'EX', YEARS_CACHE_TTL);
  return years;
}

// A publish/delete touching one type still can't know the other type's list is
// unaffected without extra bookkeeping, so both type year-lists are cleared —
// two keys, always correct, negligible cost.
export async function invalidateYearsCache(redis: RedisClient): Promise<void> {
  await redis.del(...EXAM_TYPES.map((t) => yearsCacheKey(t)));
}
