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

// `.returning()` destructures to `T | undefined` under noUncheckedIndexedAccess
// even though a single-row insert always returns exactly one row.
function assertDefined<T>(value: T | undefined): asserts value is T {
  expect(value).toBeDefined();
}

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
    sql`TRUNCATE rejects, attempts, imports, column_aliases RESTART IDENTITY CASCADE`,
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

async function seedAttempt(
  importId: number,
  examNo = '00001',
  examType: 'bac' | 'brevet' = 'bac',
) {
  const [attempt] = await db
    .insert(schema.attempts)
    .values({
      examType,
      examYear: 2024,
      examNo,
      nameFr: 'Test',
      importId,
      decision: 'Admis',
      moyenne: '14.50',
      // Brevet has no track; serie is null.
      serie: examType === 'brevet' ? null : 'SN',
    })
    .returning({ id: schema.attempts.id });
  if (!attempt) throw new Error('attempt insert failed');
  return attempt.id;
}

// ---------------------------------------------------------------------------
// attempts: UNIQUE (exam_type, exam_year, exam_no)
// ---------------------------------------------------------------------------

describe('attempts.UNIQUE(exam_type, exam_year, exam_no)', () => {
  it('inserts an attempt successfully', async () => {
    const importId = await seedImport();
    const id = await seedAttempt(importId, '00001');
    expect(id).toBeTypeOf('number');
  });

  it('rejects a duplicate (exam_type, exam_year, exam_no) triple', async () => {
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
      .values({ examType: 'bac', examYear: 2023, examNo: '00001', nameFr: 'Test', importId, decision: 'Admis', moyenne: '14.50', serie: 'SN' })
      .returning({ id: schema.attempts.id });
    expect(second?.id).toBeTypeOf('number');
  });

  it('allows the same (year, exam_no) across different exam types (Bac vs Brevet)', async () => {
    const importId = await seedImport();
    await seedAttempt(importId, '00001', 'bac');

    // Same year + exam_no, different type — must succeed (the core two-type guarantee).
    const brevetId = await seedAttempt(importId, '00001', 'brevet');
    expect(brevetId).toBeTypeOf('number');

    const rows = await db
      .select({ examType: schema.attempts.examType, serie: schema.attempts.serie })
      .from(schema.attempts)
      .where(eq(schema.attempts.examNo, '00001'));
    expect(rows).toHaveLength(2);
    // The Brevet row carries a null serie.
    const brevet = rows.find((r) => r.examType === 'brevet');
    expect(brevet?.serie).toBeNull();
  });

  it('preserves leading zeros in exam_no', async () => {
    const importId = await seedImport();
    await db
      .insert(schema.attempts)
      .values({ examType: 'bac', examYear: 2024, examNo: '00042', nameFr: 'Test', importId, decision: 'Admis', moyenne: '14.50', serie: 'SN' });

    const rows = await db
      .select({ examNo: schema.attempts.examNo })
      .from(schema.attempts)
      .where(eq(schema.attempts.examYear, 2024));

    expect(rows[0]?.examNo).toBe('00042');
  });
});

// ---------------------------------------------------------------------------
// attempts: required fields (decision, moyenne, serie)
// ---------------------------------------------------------------------------

describe('attempts — required and nullable fields', () => {
  it('stores and reads back decision and serie (required) and moyenne (nullable) correctly', async () => {
    const importId = await seedImport();
    await seedAttempt(importId, '00001');

    const rows = await db
      .select({
        decision: schema.attempts.decision,
        moyenne: schema.attempts.moyenne,
        serie: schema.attempts.serie,
      })
      .from(schema.attempts)
      .where(eq(schema.attempts.examNo, '00001'));

    expect(rows[0]?.decision).toBe('Admis');
    expect(rows[0]?.moyenne).toBe('14.50');
    expect(rows[0]?.serie).toBe('SN');
  });

  it('allows moyenne to be null (e.g. Annulé attempt has no grade)', async () => {
    const importId = await seedImport();
    const [attempt] = await db
      .insert(schema.attempts)
      .values({
        examType: 'bac', examYear: 2024, examNo: '00002', nameFr: 'Test',
        importId, decision: 'Annulé', moyenne: null, serie: 'SN',
      })
      .returning({ id: schema.attempts.id });

    assertDefined(attempt);
    const rows = await db
      .select({ moyenne: schema.attempts.moyenne })
      .from(schema.attempts)
      .where(eq(schema.attempts.id, attempt.id));

    expect(rows[0]?.moyenne).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// attempts.public_slug: NOT NULL + UNIQUE, DB-default populated
// ---------------------------------------------------------------------------

describe('attempts.public_slug', () => {
  it('auto-populates a non-null slug on insert (no app code)', async () => {
    const importId = await seedImport();
    const [attempt] = await db
      .insert(schema.attempts)
      .values({ examType: 'bac', examYear: 2024, examNo: '00001', nameFr: 'Test', importId, decision: 'Admis', moyenne: '14.50', serie: 'SN' })
      .returning({ publicSlug: schema.attempts.publicSlug });

    assertDefined(attempt);
    expect(attempt.publicSlug).toBeTypeOf('string');
    expect(attempt.publicSlug.length).toBeGreaterThan(0);
    // uuid-hex default: 32 lowercase hex chars, URL-safe, no dashes
    expect(attempt.publicSlug).toMatch(/^[a-f0-9]{32}$/);
  });

  it('gives two rows different slugs', async () => {
    const importId = await seedImport();
    const a1 = await seedAttempt(importId, '00001');
    const a2 = await seedAttempt(importId, '00002');

    const rows = await db
      .select({ id: schema.attempts.id, publicSlug: schema.attempts.publicSlug })
      .from(schema.attempts);

    const slugs = rows.map((r) => r.publicSlug);
    expect(new Set(slugs).size).toBe(2);
    expect(a1).not.toBe(a2);
  });

  it('is stable across reads for the same row', async () => {
    const importId = await seedImport();
    const id = await seedAttempt(importId, '00001');

    const first = await db
      .select({ publicSlug: schema.attempts.publicSlug })
      .from(schema.attempts)
      .where(eq(schema.attempts.id, id));
    const second = await db
      .select({ publicSlug: schema.attempts.publicSlug })
      .from(schema.attempts)
      .where(eq(schema.attempts.id, id));

    expect(first[0]?.publicSlug).toBe(second[0]?.publicSlug);
  });

  it('rejects a duplicate public_slug (UNIQUE)', async () => {
    const importId = await seedImport();
    const [first] = await db
      .insert(schema.attempts)
      .values({ examType: 'bac', examYear: 2024, examNo: '00001', nameFr: 'Test', importId, decision: 'Admis', moyenne: '14.50', serie: 'SN' })
      .returning({ publicSlug: schema.attempts.publicSlug });

    assertDefined(first);
    let err: unknown;
    try {
      await db
        .insert(schema.attempts)
        .values({ examType: 'bac', examYear: 2023, examNo: '00001', nameFr: 'Test', importId, decision: 'Admis', moyenne: '14.50', serie: 'SN', publicSlug: first.publicSlug });
    } catch (e) {
      err = e;
    }
    expect(isUniqueViolation(err)).toBe(true);
  });

  it('rejects an explicit null public_slug (NOT NULL)', async () => {
    const importId = await seedImport();
    let err: unknown;
    try {
      await db.execute(
        sql`INSERT INTO attempts (exam_type, exam_year, exam_no, name_fr, serie, decision, import_id, public_slug)
            VALUES ('bac', 2024, '00001', 'Test', 'SN', 'Admis', ${importId}, NULL)`,
      );
    } catch (e) {
      err = e;
    }
    // pg not_null_violation is 23502; drizzle may wrap it in `.cause`.
    const code = (err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code;
    expect(code).toBe('23502');
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
  it('exports the domain table references (attempts-only model)', () => {
    expect(schema.attempts).toBeDefined();
    expect(schema.imports).toBeDefined();
    expect(schema.rejects).toBeDefined();
    expect(schema.columnAliases).toBeDefined();
  });

  it('does not export the removed person tables', () => {
    expect('persons' in schema).toBe(false);
    expect('personLinks' in schema).toBe(false);
    expect('linkSuggestions' in schema).toBe(false);
  });

  it('exports the remaining enum definitions', () => {
    expect(schema.decisionEnum).toBeDefined();
    expect(schema.importStatusEnum).toBeDefined();
    expect(schema.examTypeEnum).toBeDefined();
  });

  it('does not export the removed link enums', () => {
    expect('linkMethodEnum' in schema).toBe(false);
    expect('suggestionStatusEnum' in schema).toBe(false);
  });
});
