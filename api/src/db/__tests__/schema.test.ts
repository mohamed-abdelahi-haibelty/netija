import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../schema.js';

// ---------------------------------------------------------------------------
// Shared pool — one connection per test run, transactions roll back each test
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString: process.env['DATABASE_URL'], max: 1 });
const db = drizzle(pool, { schema });

// Drizzle wraps the underlying pg error in `.cause`; pg unique violations have
// code '23505'. This helper extracts that regardless of wrapping depth.
function isUniqueViolation(err: unknown): boolean {
  const check = (e: unknown): boolean =>
    e instanceof Error &&
    ((e as { code?: string }).code === '23505' ||
      /duplicate key/i.test(e.message));
  return err instanceof Error && (check(err) || check(err.cause));
}

afterAll(async () => {
  await pool.end();
});

// Truncate all tables before each test so tests are fully isolated
beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE person_links, link_suggestions, rejects, attempts, imports, persons, column_aliases RESTART IDENTITY CASCADE`,
  );
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedImport() {
  const [imp] = await db
    .insert(schema.imports)
    .values({ originalFilename: 'test.xlsx', filePath: '/uploads/test.xlsx' })
    .returning({ id: schema.imports.id });
  if (!imp) throw new Error('import insert failed');
  return imp.id;
}

async function seedPerson() {
  const [person] = await db
    .insert(schema.persons)
    .values({ nameFr: 'Test Person' })
    .returning({ id: schema.persons.id });
  if (!person) throw new Error('person insert failed');
  return person.id;
}

async function seedAttempt(importId: number, examNo = '00001') {
  const [attempt] = await db
    .insert(schema.attempts)
    .values({ examYear: 2024, examNo, nameFr: 'Test', importId })
    .returning({ id: schema.attempts.id });
  if (!attempt) throw new Error('attempt insert failed');
  return attempt.id;
}

// ---------------------------------------------------------------------------
// attempts: UNIQUE (exam_year, exam_no)
// ---------------------------------------------------------------------------

describe('attempts.UNIQUE(exam_year, exam_no)', () => {
  it('inserts an attempt successfully', async () => {
    const importId = await seedImport();
    const id = await seedAttempt(importId, '00001');
    expect(id).toBeTypeOf('number');
  });

  it('rejects a duplicate (exam_year, exam_no) pair', async () => {
    const importId = await seedImport();
    await seedAttempt(importId, '00001');

    let err: unknown;
    try {
      await seedAttempt(importId, '00001');
    } catch (e) {
      err = e;
    }
    expect(isUniqueViolation(err)).toBe(true);
  });

  it('allows the same exam_no in a different year', async () => {
    const importId = await seedImport();
    await seedAttempt(importId, '00001');

    // Different year — must succeed
    const [second] = await db
      .insert(schema.attempts)
      .values({ examYear: 2023, examNo: '00001', nameFr: 'Test', importId })
      .returning({ id: schema.attempts.id });
    expect(second?.id).toBeTypeOf('number');
  });

  it('preserves leading zeros in exam_no', async () => {
    const importId = await seedImport();
    await db
      .insert(schema.attempts)
      .values({ examYear: 2024, examNo: '00042', nameFr: 'Test', importId });

    const rows = await db
      .select({ examNo: schema.attempts.examNo })
      .from(schema.attempts)
      .where(eq(schema.attempts.examYear, 2024));

    expect(rows[0]?.examNo).toBe('00042');
  });
});

// ---------------------------------------------------------------------------
// person_links.attempt_id: UNIQUE (one link per attempt)
// ---------------------------------------------------------------------------

describe('person_links.attempt_id UNIQUE', () => {
  it('links an attempt to a person', async () => {
    const importId = await seedImport();
    const personId = await seedPerson();
    const attemptId = await seedAttempt(importId);

    const [link] = await db
      .insert(schema.personLinks)
      .values({ attemptId, personId, method: 'nni' })
      .returning({ id: schema.personLinks.id });
    expect(link?.id).toBeTypeOf('number');
  });

  it('rejects a second link for the same attempt', async () => {
    const importId = await seedImport();
    const personId = await seedPerson();
    const attemptId = await seedAttempt(importId);

    await db.insert(schema.personLinks).values({ attemptId, personId, method: 'nni' });

    const secondPerson = await seedPerson();

    let err: unknown;
    try {
      await db.insert(schema.personLinks).values({ attemptId, personId: secondPerson, method: 'manual' });
    } catch (e) {
      err = e;
    }
    expect(isUniqueViolation(err)).toBe(true);
  });

  it('allows the same person to be linked to multiple attempts', async () => {
    const importId = await seedImport();
    const personId = await seedPerson();
    const attempt1 = await seedAttempt(importId, '00001');
    const attempt2 = await seedAttempt(importId, '00002');

    await db.insert(schema.personLinks).values({ attemptId: attempt1, personId, method: 'nni' });
    const [link2] = await db
      .insert(schema.personLinks)
      .values({ attemptId: attempt2, personId, method: 'match_key' })
      .returning({ id: schema.personLinks.id });

    expect(link2?.id).toBeTypeOf('number');
  });
});

// ---------------------------------------------------------------------------
// column_aliases.raw_header: UNIQUE
// ---------------------------------------------------------------------------

describe('column_aliases.raw_header UNIQUE', () => {
  it('rejects a duplicate raw_header', async () => {
    await db.insert(schema.columnAliases).values({ rawHeader: 'NOMPL', canonicalField: 'name_fr' });

    let err: unknown;
    try {
      await db.insert(schema.columnAliases).values({ rawHeader: 'NOMPL', canonicalField: 'name_fr' });
    } catch (e) {
      err = e;
    }
    expect(isUniqueViolation(err)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Drizzle types compile and schema exports are importable
// ---------------------------------------------------------------------------

describe('schema exports', () => {
  it('exports all seven table references', () => {
    expect(schema.attempts).toBeDefined();
    expect(schema.persons).toBeDefined();
    expect(schema.personLinks).toBeDefined();
    expect(schema.linkSuggestions).toBeDefined();
    expect(schema.imports).toBeDefined();
    expect(schema.rejects).toBeDefined();
    expect(schema.columnAliases).toBeDefined();
  });

  it('exports all four enum definitions', () => {
    expect(schema.decisionEnum).toBeDefined();
    expect(schema.importStatusEnum).toBeDefined();
    expect(schema.linkMethodEnum).toBeDefined();
    expect(schema.suggestionStatusEnum).toBeDefined();
  });
});
