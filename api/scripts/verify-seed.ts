/**
 * Verifies that the seed data is installed and all documented scenarios are
 * queryable. Exits with code 0 if all assertions pass, 1 if any fail.
 *
 * The model is attempts-only: a result is a single attempt row, with no person
 * concept and no identity linking.
 *
 * Usage (from the project root):
 *   npx tsx api/scripts/verify-seed.ts
 * Or (from api/):
 *   npm run db:verify-seed
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/db/schema.js';

const { attempts, imports } = schema;

// Load environment
for (const path of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../.env')]) {
  const { error } = config({ path, override: false });
  if (!error && process.env['DATABASE_URL']) break;
}

const dbUrl = process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('Error: DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });
const db = drizzle(pool, { schema });

let passed = 0;
let failed = 0;

function ok(label: string): void {
  console.log(`  ✓ ${label}`);
  passed++;
}

function fail(label: string, detail?: string): void {
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  failed++;
}

function assert(label: string, condition: boolean, detail?: string): void {
  if (condition) ok(label);
  else fail(label, detail);
}

async function main(): Promise<void> {
  console.log('Verifying seed data…\n');

  // ---- Imports ------------------------------------------------------------
  console.log('Imports:');
  const allImports = await db.select().from(imports);
  assert('3 import rows exist', allImports.length === 3, `found ${String(allImports.length)}`);

  const published = allImports.filter((i) => i.published);
  const unpublished = allImports.filter((i) => !i.published);
  assert('2 published imports', published.length === 2, `found ${String(published.length)}`);
  assert('1 unpublished import', unpublished.length === 1, `found ${String(unpublished.length)}`);

  const years = allImports.map((i) => i.examYear).sort();
  assert(
    'Exam years are 2022, 2023, 2024',
    JSON.stringify(years) === JSON.stringify([2022, 2023, 2024]),
    `found ${JSON.stringify(years)}`,
  );

  // ---- Attempt totals -----------------------------------------------------
  console.log('\nAttempt totals:');
  const [totalRow] = await db.select({ n: sql<string>`count(*)` }).from(attempts);
  const totalAttempts = totalRow?.n ?? '0';
  assert('≥ 200 attempts total', Number(totalAttempts) >= 200, `found ${totalAttempts}`);

  for (const year of [2022, 2023, 2024]) {
    const [yearRow] = await db
      .select({ n: sql<string>`count(*)` })
      .from(attempts)
      .where(eq(attempts.examYear, year));
    const n = yearRow?.n ?? '0';
    assert(`≥ 90 attempts in ${String(year)}`, Number(n) >= 90, `found ${n}`);
  }

  // ---- Decision coverage --------------------------------------------------
  console.log('\nDecision values:');
  const decisionRows = await db
    .select({ d: attempts.decision })
    .from(attempts)
    .groupBy(attempts.decision);
  const decisions = new Set(decisionRows.map((r) => r.d).filter(Boolean));
  for (const d of ['Admis', 'Ajourné', 'Sessionnaire', 'Absent', 'Délibérable', 'Annulé']) {
    assert(`Decision "${d}" present`, decisions.has(d as typeof attempts.decision._.data));
  }

  // ---- SERIE coverage -----------------------------------------------------
  console.log('\nSERIE values:');
  const serieRows = await db
    .select({ s: attempts.serie })
    .from(attempts)
    .groupBy(attempts.serie);
  const series = new Set(serieRows.map((r) => r.s).filter(Boolean));
  for (const s of ['SN', 'LM', 'LO', 'M', 'TM', 'TS', 'LA']) {
    assert(`SERIE "${s}" present`, series.has(s));
  }

  // ---- Same name across years as SEPARATE rows ----------------------------
  console.log('\nSame name across years (independent rows):');
  const repeated = await db
    .select({ year: attempts.examYear, decision: attempts.decision })
    .from(attempts)
    .where(eq(attempts.nameFr, 'Ahmed Ould Mohamed'));
  const repeatedYears = new Set(repeated.map((r) => r.year));
  assert(
    '"Ahmed Ould Mohamed" appears in ≥ 2 years as separate rows',
    repeatedYears.size >= 2,
    `found years: ${[...repeatedYears].join(', ')}`,
  );

  // ---- Same name, same year, different exam numbers -----------------------
  const sameYear = await db
    .select({ examNo: attempts.examNo })
    .from(attempts)
    .where(and(eq(attempts.nameFr, 'Mohamed Ould Ahmed'), eq(attempts.examYear, 2022)));
  assert(
    '"Mohamed Ould Ahmed" appears ≥ 2 times in 2022 (distinct exam numbers)',
    new Set(sameYear.map((r) => r.examNo)).size >= 2,
    `found ${String(sameYear.length)}`,
  );

  // ---- Name type coverage -------------------------------------------------
  console.log('\nName type coverage:');
  const [arOnlyRow] = await db
    .select({ n: sql<string>`count(*)` })
    .from(attempts)
    .where(and(sql`name_fr IS NULL`, sql`name_ar IS NOT NULL`));
  const arOnlyCount = arOnlyRow?.n ?? '0';
  assert('Arabic-only attempts exist', Number(arOnlyCount) >= 1, `found ${arOnlyCount}`);

  const [frOnlyRow] = await db
    .select({ n: sql<string>`count(*)` })
    .from(attempts)
    .where(and(sql`name_fr IS NOT NULL`, sql`name_ar IS NULL`));
  const frOnlyCount = frOnlyRow?.n ?? '0';
  assert('French-only attempts exist', Number(frOnlyCount) >= 1, `found ${frOnlyCount}`);

  const [bilingualRow] = await db
    .select({ n: sql<string>`count(*)` })
    .from(attempts)
    .where(and(sql`name_fr IS NOT NULL`, sql`name_ar IS NOT NULL`));
  const bilingualCount = bilingualRow?.n ?? '0';
  assert('Bilingual attempts exist', Number(bilingualCount) >= 1, `found ${bilingualCount}`);

  // ---- Nullable moyenne (Annulé) ------------------------------------------
  console.log('\nNullable moyenne:');
  const [nullMoyenneRow] = await db
    .select({ n: sql<string>`count(*)` })
    .from(attempts)
    .where(sql`moyenne IS NULL`);
  const nullMoyenne = nullMoyenneRow?.n ?? '0';
  assert('At least 1 attempt with a null moyenne', Number(nullMoyenne) >= 1, `found ${nullMoyenne}`);

  // ---- Summary ------------------------------------------------------------
  console.log(`\n${String(passed)} passed · ${String(failed)} failed`);
}

main()
  .then(() => { if (failed > 0) process.exitCode = 1; })
  .catch((e: unknown) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
