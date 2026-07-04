import { eq, and } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { RedisClient } from '../lib/redis.js';
import { attempts, imports } from '../db/schema.js';
import type { ExamSearchResult } from 'shared';

const EXAM_CACHE_TTL = 300;
const YEARS_CACHE_TTL = 3600;

export function examCacheKey(year: number, examNo: string): string {
  return `exam:${String(year)}:${examNo}`;
}

const YEARS_CACHE_KEY = 'years:published';

export async function searchByExamNo(
  db: Db,
  redis: RedisClient,
  examNo: string,
  year: number,
): Promise<ExamSearchResult | null> {
  const cacheKey = examCacheKey(year, examNo);
  const cached = await redis.get(cacheKey);
  if (cached !== null) {
    return JSON.parse(cached) as ExamSearchResult;
  }

  const rows = await db
    .select({
      slug: attempts.publicSlug,
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

export async function getPublishedYears(db: Db, redis: RedisClient): Promise<number[]> {
  const cached = await redis.get(YEARS_CACHE_KEY);
  if (cached !== null) {
    return JSON.parse(cached) as number[];
  }

  const rows = await db
    .selectDistinct({ year: imports.examYear })
    .from(imports)
    .where(eq(imports.published, true));

  const years = rows
    .map((r) => r.year)
    .filter((y): y is number => y !== null)
    .sort((a, b) => b - a);

  await redis.set(YEARS_CACHE_KEY, JSON.stringify(years), 'EX', YEARS_CACHE_TTL);
  return years;
}

export async function invalidateExamCache(
  redis: RedisClient,
  year: number,
  examNo: string,
): Promise<void> {
  await redis.del(examCacheKey(year, examNo));
}

export async function invalidateYearsCache(redis: RedisClient): Promise<void> {
  await redis.del(YEARS_CACHE_KEY);
}
