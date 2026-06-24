/**
 * Verifies that the seed data is installed and all documented scenarios are
 * queryable. Exits with code 0 if all assertions pass, 1 if any fail.
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

const { attempts, imports, linkSuggestions, personLinks, persons } = schema;

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
  assert('3 import rows exist', allImports.length === 3, `found ${allImports.length}`);

  const published = allImports.filter(i => i.published);
  const unpublished = allImports.filter(i => !i.published);
  assert('2 published imports', published.length === 2, `found ${published.length}`);
  assert('1 unpublished import', unpublished.length === 1, `found ${unpublished.length}`);

  const years = allImports.map(i => i.examYear).sort();
  assert(
    'Exam years are 2022, 2023, 2024',
    JSON.stringify(years) === JSON.stringify([2022, 2023, 2024]),
    `found ${JSON.stringify(years)}`,
  );

  // ---- Attempt totals -----------------------------------------------------
  console.log('\nAttempt totals:');
  const [{ n: totalAttempts }] = await db.select({ n: sql<string>`count(*)` }).from(attempts);
  assert('≥ 200 attempts total', Number(totalAttempts) >= 200, `found ${totalAttempts}`);

  for (const year of [2022, 2023, 2024]) {
    const [{ n }] = await db
      .select({ n: sql<string>`count(*)` })
      .from(attempts)
      .where(eq(attempts.examYear, year));
    assert(`≥ 90 attempts in ${year}`, Number(n) >= 90, `found ${n}`);
  }

  // ---- Decision coverage --------------------------------------------------
  console.log('\nDecision values:');
  const decisionRows = await db
    .select({ d: attempts.decision })
    .from(attempts)
    .groupBy(attempts.decision);
  const decisions = new Set(decisionRows.map(r => r.d).filter(Boolean));
  for (const d of ['Admis', 'Ajourné', 'Sessionnaire', 'Absent', 'Délibérable', 'Annulé']) {
    assert(`Decision "${d}" present`, decisions.has(d as typeof attempts.decision._.data));
  }

  // ---- SERIE coverage -----------------------------------------------------
  console.log('\nSERIE values:');
  const serieRows = await db
    .select({ s: attempts.serie })
    .from(attempts)
    .groupBy(attempts.serie);
  const series = new Set(serieRows.map(r => r.s).filter(Boolean));
  for (const s of ['SN', 'LM', 'LO', 'M', 'TM', 'TS', 'LA']) {
    assert(`SERIE "${s}" present`, series.has(s));
  }

  // ---- Redemption scenario ------------------------------------------------
  console.log('\nRedemption scenario (Ajourné → Admis across years):');
  const redemptionLinks = await db
    .select({ personId: personLinks.personId, year: attempts.examYear, dec: attempts.decision })
    .from(personLinks)
    .innerJoin(attempts, eq(personLinks.attemptId, attempts.id))
    .where(eq(personLinks.method, 'nni'));

  // Group by personId and check for persons with both Ajourné and Admis
  const byPerson = new Map<number, Set<string>>();
  for (const row of redemptionLinks) {
    if (!byPerson.has(row.personId)) byPerson.set(row.personId, new Set());
    if (row.dec) byPerson.get(row.personId)!.add(row.dec);
  }
  const redemptionPersons = [...byPerson.values()].filter(
    decs => decs.has('Ajourné') && decs.has('Admis'),
  );
  assert(
    'At least 1 person with Ajourné then Admis (NNI-linked)',
    redemptionPersons.length >= 1,
    `found ${redemptionPersons.length}`,
  );

  // ---- Identical-name, different birth place ------------------------------
  console.log('\nIdentical-name persons (different birth place):');
  const sameNameAttempts = await db
    .select({ nameFr: attempts.nameFr, bp: attempts.birthPlace })
    .from(attempts)
    .where(eq(attempts.nameFr, 'Mohamed Ould Ahmed'));
  const uniquePlaces = new Set(sameNameAttempts.map(r => r.bp));
  assert(
    '"Mohamed Ould Ahmed" appears with ≥ 2 different birth places',
    uniquePlaces.size >= 2,
    `found places: ${[...uniquePlaces].join(', ')}`,
  );

  // ---- Name type coverage -------------------------------------------------
  console.log('\nName type coverage:');
  const [{ n: arOnlyCount }] = await db
    .select({ n: sql<string>`count(*)` })
    .from(persons)
    .where(and(sql`name_fr IS NULL`, sql`name_ar IS NOT NULL`));
  assert('Arabic-only persons exist', Number(arOnlyCount) >= 1, `found ${arOnlyCount}`);

  const [{ n: frOnlyCount }] = await db
    .select({ n: sql<string>`count(*)` })
    .from(persons)
    .where(and(sql`name_fr IS NOT NULL`, sql`name_ar IS NULL`));
  assert('French-only persons exist', Number(frOnlyCount) >= 1, `found ${frOnlyCount}`);

  const [{ n: bilingualCount }] = await db
    .select({ n: sql<string>`count(*)` })
    .from(persons)
    .where(and(sql`name_fr IS NOT NULL`, sql`name_ar IS NOT NULL`));
  assert('Bilingual persons exist', Number(bilingualCount) >= 1, `found ${bilingualCount}`);

  // ---- match_key cross-year links -----------------------------------------
  console.log('\nmatch_key cross-year linking:');
  const [{ n: mkLinkCount }] = await db
    .select({ n: sql<string>`count(*)` })
    .from(personLinks)
    .where(eq(personLinks.method, 'match_key'));
  assert('match_key person_links exist', Number(mkLinkCount) >= 1, `found ${mkLinkCount}`);

  // ---- Pending link_suggestion --------------------------------------------
  console.log('\nLink suggestions:');
  const [{ n: pendingCount }] = await db
    .select({ n: sql<string>`count(*)` })
    .from(linkSuggestions)
    .where(eq(linkSuggestions.status, 'pending'));
  assert('At least 1 pending link_suggestion', Number(pendingCount) >= 1, `found ${pendingCount}`);

  // ---- Every attempt has a person_link ------------------------------------
  console.log('\nData integrity:');
  const [{ n: unlinkedCount }] = await db.select({ n: sql<string>`count(*)` }).from(
    db
      .select({ id: attempts.id })
      .from(attempts)
      .leftJoin(personLinks, eq(attempts.id, personLinks.attemptId))
      .where(sql`person_links.id IS NULL`)
      .as('unlinked'),
  );
  assert('Every attempt has a person_link', Number(unlinkedCount) === 0, `${unlinkedCount} unlinked`);

  // ---- Summary ------------------------------------------------------------
  console.log(`\n${passed} passed · ${failed} failed`);
}

main()
  .then(() => { if (failed > 0) process.exitCode = 1; })
  .catch((e: unknown) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
