import { eq, and, inArray, desc } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { RedisClient } from '../lib/redis.js';
import { attempts, imports, personLinks, linkSuggestions, persons } from '../db/schema.js';
import type { StudentPageData, SeeAlsoEntry } from 'shared';

const STUDENT_CACHE_TTL = 3600;

function studentCacheKey(personId: number): string {
  return `student:${personId}`;
}

export async function getStudentPage(
  db: Db,
  redis: RedisClient,
  personId: number,
): Promise<StudentPageData | null> {
  const cacheKey = studentCacheKey(personId);
  const cached = await redis.get(cacheKey);
  if (cached !== null) return JSON.parse(cached) as StudentPageData;

  // Fetch all attempt IDs for this person (published and unpublished) for
  // suggestion direction-2 lookup and for existence check.
  const allLinks = await db
    .select({ attemptId: personLinks.attemptId })
    .from(personLinks)
    .where(eq(personLinks.personId, personId));

  if (allLinks.length === 0) return null;

  const attemptIds = allLinks.map((l) => l.attemptId);

  // Fetch published attempts only, newest year first.
  const rawAttempts = await db
    .select({
      examYear: attempts.examYear,
      examNo: attempts.examNo,
      serie: attempts.serie,
      moyenne: attempts.moyenne,
      decision: attempts.decision,
      decisionRaw: attempts.decisionRaw,
      school: attempts.school,
      wilaya: attempts.wilaya,
      nameFr: attempts.nameFr,
      nameAr: attempts.nameAr,
      birthDate: attempts.birthDate,
      birthPlace: attempts.birthPlace,
    })
    .from(attempts)
    .innerJoin(imports, eq(imports.id, attempts.importId))
    .where(and(inArray(attempts.id, attemptIds), eq(imports.published, true)))
    .orderBy(desc(attempts.examYear));

  if (rawAttempts.length === 0) return null;

  const first = rawAttempts[0]!;

  // Direction 1: an external attempt is suggested to belong to our person.
  // "Other person" = the current owner of the suggestion's attempt.
  const dir1 = await db
    .select({
      otherPersonId: personLinks.personId,
      otherNameFr: persons.nameFr,
      otherNameAr: persons.nameAr,
      examYear: attempts.examYear,
      examNo: attempts.examNo,
    })
    .from(linkSuggestions)
    .innerJoin(attempts, eq(attempts.id, linkSuggestions.attemptId))
    .innerJoin(personLinks, eq(personLinks.attemptId, linkSuggestions.attemptId))
    .innerJoin(persons, eq(persons.id, personLinks.personId))
    .where(
      and(eq(linkSuggestions.personId, personId), eq(linkSuggestions.status, 'pending')),
    );

  // Direction 2: one of our attempts is suggested to belong to another person.
  // "Other person" = suggestion.person_id.
  const dir2 = await db
    .select({
      otherPersonId: linkSuggestions.personId,
      otherNameFr: persons.nameFr,
      otherNameAr: persons.nameAr,
      examYear: attempts.examYear,
      examNo: attempts.examNo,
    })
    .from(linkSuggestions)
    .innerJoin(attempts, eq(attempts.id, linkSuggestions.attemptId))
    .innerJoin(persons, eq(persons.id, linkSuggestions.personId))
    .where(
      and(inArray(linkSuggestions.attemptId, attemptIds), eq(linkSuggestions.status, 'pending')),
    );

  // Deduplicate see-also entries by other person's ID.
  const seenIds = new Set<number>();
  const seeAlso: SeeAlsoEntry[] = [];
  for (const entry of [...dir1, ...dir2]) {
    if (entry.otherPersonId !== personId && !seenIds.has(entry.otherPersonId)) {
      seenIds.add(entry.otherPersonId);
      seeAlso.push({
        personId: String(entry.otherPersonId),
        nameFr: entry.otherNameFr,
        nameAr: entry.otherNameAr,
        examYear: entry.examYear,
        examNo: entry.examNo,
      });
    }
  }

  const result: StudentPageData = {
    personId: String(personId),
    nameFr: first.nameFr,
    nameAr: first.nameAr,
    birthDate: first.birthDate,
    birthPlace: first.birthPlace,
    attempts: rawAttempts.map((a) => ({
      examYear: a.examYear,
      examNo: a.examNo,
      serie: a.serie,
      moyenne: a.moyenne,
      decision: a.decision,
      decisionRaw: a.decisionRaw,
      school: a.school,
      wilaya: a.wilaya,
    })),
    seeAlso,
  };

  await redis.set(cacheKey, JSON.stringify(result), 'EX', STUDENT_CACHE_TTL);
  return result;
}

export async function invalidateStudentCache(redis: RedisClient, personId: number): Promise<void> {
  await redis.del(studentCacheKey(personId));
}
