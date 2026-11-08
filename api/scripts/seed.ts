/**
 * Development/staging seed script.
 * Populates the database with realistic fake data covering all scenarios
 * required for building the public read path.
 *
 * The data model is minimal and attempts-only: a "result" is a single attempt
 * row. There is no person concept and no identity linking. Names that repeat
 * across years are stored as SEPARATE, independent rows.
 *
 * Idempotent: a second run detects existing seed imports and exits cleanly.
 * Refuses to run against a production-flagged environment.
 *
 * Usage (from the project root):
 *   npx tsx api/scripts/seed.ts
 * Or (from api/):
 *   npm run db:seed
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';
import { like, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/db/schema.js';

// ---------------------------------------------------------------------------
// Environment — load before creating the pool
// ---------------------------------------------------------------------------

for (const path of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../.env')]) {
  const { error } = config({ path, override: false });
  if (!error && process.env['DATABASE_URL']) break;
}

// ---------------------------------------------------------------------------
// Production guard
// ---------------------------------------------------------------------------

const appEnv = process.env['APP_ENV'] ?? process.env['NODE_ENV'] ?? '';
if (appEnv === 'production') {
  console.error('Error: refusing to seed a production environment (set APP_ENV or NODE_ENV).');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Database connection
// ---------------------------------------------------------------------------

const dbUrl = process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('Error: DATABASE_URL is not set. Ensure .env is present at the project root.');
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });
const db = drizzle(pool, { schema });

const { attempts, imports } = schema;

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

const SERIES = ['SN', 'LM', 'LO', 'M', 'TM', 'TS', 'LA'] as const;

// All normalized decision values paired with realistic raw source strings
const DECISION_POOL = [
  { decision: 'Admis' as const,        decisionRaw: 'Admis' },
  { decision: 'Admis' as const,        decisionRaw: 'Admis Sn' },
  { decision: 'Ajourné' as const,      decisionRaw: 'Ajourné' },
  { decision: 'Ajourné' as const,      decisionRaw: 'Ajourné(e)' },
  { decision: 'Ajourné' as const,      decisionRaw: 'Ajourné Sn' },
  { decision: 'Sessionnaire' as const, decisionRaw: 'Sessionnaire' },
  { decision: 'Sessionnaire' as const, decisionRaw: 'Sessionaire' },
  { decision: 'Absent' as const,       decisionRaw: 'Absent' },
  { decision: 'Absent' as const,       decisionRaw: 'Abscent' },
  { decision: 'Délibérable' as const,  decisionRaw: 'Délibérable' },
  { decision: 'Délibérable' as const,  decisionRaw: 'Delibérable' },
  { decision: 'Annulé' as const,       decisionRaw: 'Examen annulé CT (Usage du Téléphone)' },
];

const FR_FIRST = [
  'Ali', 'Fatima', 'Ibrahim', 'Aminata', 'Cheikh', 'Mariam', 'Oumar',
  'Khadijetou', 'Abderrahmane', 'Sokhna', 'Biram', 'Hawa', 'Mamadou',
  'Ndeye', 'Moussa', 'Salimata', 'Zeinab', 'Isselmou', 'Sidi', 'Brahim',
];
const FR_LAST = [
  'Ould Ahmed', 'Mint Salem', 'Ba', 'Diallo', 'Ould Mohamed', 'Mint Brahim',
  'Ould Sidi', 'Mint Cheikh', 'Konaté', 'Traoré', 'Mbaye', 'Fall',
  'Ould Abdallah', 'Mint Ely', 'Sow', 'Camara', 'Ould Hamedoun', 'Mint Mokhtar',
  'Ould Brahim', 'Mint Abdallah',
];
const AR_FIRST = [
  'محمد', 'فاطمة', 'عبد الله', 'آمنة', 'أحمد', 'خديجة', 'سيدي', 'مريم', 'إبراهيم', 'زينب',
];
const AR_FAMILY = [
  'ولد أحمد', 'بنت محمد', 'ولد سيدي', 'بنت عمر', 'ولد إبراهيم', 'بنت إسحاق',
  'ولد عبد الله', 'بنت عيسى', 'ولد يحيى', 'بنت علي',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pick<T>(arr: readonly T[], i: number): T {
  const value = arr[i % arr.length];
  if (value === undefined) throw new Error('pick: array is empty');
  return value;
}

function eno(n: number): string {
  return String(n).padStart(5, '0');
}

function moy(decision: string, i: number): string {
  const base = decision === 'Admis' ? 12 : decision === 'Ajourné' ? 7 : 9;
  return (base + (i % 8) * 0.5).toFixed(2);
}

function frName(i: number): string {
  return `${pick(FR_FIRST, i)} ${pick(FR_LAST, i + 4)}`;
}

function arName(i: number): string {
  return `${pick(AR_FIRST, i)} ${pick(AR_FAMILY, i + 2)}`;
}

type NewAttempt = typeof attempts.$inferInsert;

// Builds one attempt row. `seed` drives deterministic variation; `kind`
// (0..2) selects FR-only / AR-only / bilingual names. Brevet has no serie
// (track), so its rows store serie = null — the same shape the pipeline
// produces for a Brevet import.
function makeAttempt(
  examType: 'bac' | 'brevet',
  year: number,
  importId: number,
  no: number,
  seed: number,
): NewAttempt {
  const dec = pick(DECISION_POOL, seed);
  const kind = seed % 3;
  const nameFr = kind === 1 ? null : frName(seed);
  const nameAr = kind === 0 ? null : arName(seed);
  const isAnnule = dec.decision === 'Annulé';
  return {
    examType,
    examYear: year,
    examNo: eno(no),
    nameFr,
    nameAr,
    serie: examType === 'brevet' ? null : pick(SERIES, seed),
    // Annulé attempts have no grade
    moyenne: isAnnule ? null : moy(dec.decision, seed),
    decision: dec.decision,
    decisionRaw: dec.decisionRaw,
    importId,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Idempotency: if any seed import row exists, the seed has already run
  const [existing] = await db
    .select({ id: imports.id })
    .from(imports)
    .where(like(imports.originalFilename, 'seed/%'))
    .limit(1);

  if (existing) {
    const [countRow] = await db.select({ n: sql<string>`count(*)` }).from(attempts);
    console.log(`Seed already applied — ${countRow?.n ?? '0'} attempts. Nothing to do.`);
    return;
  }

  console.log('Seeding…');

  // ---- 1. Import rows -------------------------------------------------------
  // 2022 and 2023: published. 2024: unpublished (for the publish flow).

  const [imp2022, imp2023, imp2024, impBrevet2023] = await db
    .insert(imports)
    .values([
      {
        originalFilename: 'seed/bac-2022', filePath: 'seed/bac-2022',
        status: 'completed', examType: 'bac', examYear: 2022,
        summaryInserted: 100, summaryRejected: 0,
        smokePassed: true, published: true,
      },
      {
        originalFilename: 'seed/bac-2023', filePath: 'seed/bac-2023',
        status: 'completed', examType: 'bac', examYear: 2023,
        summaryInserted: 100, summaryRejected: 0,
        smokePassed: true, published: true,
      },
      {
        originalFilename: 'seed/bac-2024', filePath: 'seed/bac-2024',
        status: 'completed', examType: 'bac', examYear: 2024,
        summaryInserted: 100, summaryRejected: 0,
        smokePassed: true, published: false,
      },
      {
        // Brevet 2023 deliberately reuses exam numbers 1..60 that also exist
        // in Bac 2023 — proving a Bac and a Brevet can share (year, exam_no)
        // without colliding, thanks to UNIQUE(exam_type, exam_year, exam_no).
        originalFilename: 'seed/brevet-2023', filePath: 'seed/brevet-2023',
        status: 'completed', examType: 'brevet', examYear: 2023,
        summaryInserted: 60, summaryRejected: 0,
        smokePassed: true, published: true,
      },
    ])
    .returning();

  if (!imp2022 || !imp2023 || !imp2024 || !impBrevet2023) {
    throw new Error('Expected 4 import rows to come back from the insert.');
  }
  const iid22 = imp2022.id;
  const iid23 = imp2023.id;
  const iid24 = imp2024.id;
  const iidBrevet23 = impBrevet2023.id;

  // ---- 2. Bulk attempts, one batch per year --------------------------------
  // Each year gets exam numbers 1..100. The seed offsets differ per year so
  // most rows vary, but a handful of names deliberately repeat across years —
  // stored as SEPARATE rows, never merged.

  const rows2022 = Array.from({ length: 100 }, (_, i) => makeAttempt('bac', 2022, iid22, i + 1, i));
  const rows2023 = Array.from({ length: 100 }, (_, i) => makeAttempt('bac', 2023, iid23, i + 1, i + 40));
  const rows2024 = Array.from({ length: 100 }, (_, i) => makeAttempt('bac', 2024, iid24, i + 1, i + 80));
  // Brevet 2023: exam numbers 1..60 overlap Bac 2023's — same (year, exam_no),
  // different exam_type, no collision. serie is null (Brevet has no track).
  const rowsBrevet2023 = Array.from({ length: 60 }, (_, i) =>
    makeAttempt('brevet', 2023, iidBrevet23, i + 1, i + 15),
  );

  // ---- 3. Repeated-name-across-years scenarios (separate rows) -------------
  // Same fabricated name appears in 2022 and 2023 as two independent attempts
  // with different exam numbers, series, and decisions.
  rows2022[0] = {
    examType: 'bac', examYear: 2022, examNo: eno(1), nameFr: 'Ahmed Ould Mohamed', nameAr: 'أحمد ولد محمد',
    serie: 'SN', moyenne: '08.50', decision: 'Ajourné', decisionRaw: 'Ajourné(e)',
    importId: iid22,
  };
  rows2023[0] = {
    examType: 'bac', examYear: 2023, examNo: eno(1), nameFr: 'Ahmed Ould Mohamed', nameAr: 'أحمد ولد محمد',
    serie: 'SN', moyenne: '12.75', decision: 'Admis', decisionRaw: 'Admis Sn',
    importId: iid23,
  };

  // Same name, same year, different exam numbers — two distinct candidates.
  rows2022[1] = {
    examType: 'bac', examYear: 2022, examNo: eno(2), nameFr: 'Mohamed Ould Ahmed', nameAr: null,
    serie: 'LM', moyenne: '13.00', decision: 'Admis', decisionRaw: 'Admis',
    importId: iid22,
  };
  rows2022[2] = {
    examType: 'bac', examYear: 2022, examNo: eno(3), nameFr: 'Mohamed Ould Ahmed', nameAr: null,
    serie: 'TS', moyenne: '09.25', decision: 'Ajourné', decisionRaw: 'Ajourné',
    importId: iid22,
  };

  // Arabic-only and French-only rows.
  rows2022[3] = {
    examType: 'bac', examYear: 2022, examNo: eno(4), nameFr: null, nameAr: 'فاطمة بنت عبد الله',
    serie: 'M', moyenne: '10.25', decision: 'Sessionnaire', decisionRaw: 'Sessionnaire',
    importId: iid22,
  };
  rows2022[4] = {
    examType: 'bac', examYear: 2022, examNo: eno(5), nameFr: 'Marie Dupont', nameAr: null,
    serie: 'LA', moyenne: null, decision: 'Absent', decisionRaw: 'Abscent',
    importId: iid22,
  };

  // A Brevet 2023 candidate sharing name "Ahmed Ould Mohamed" and exam_no 1
  // with the Bac 2023 row above — same year + exam_no, different type, its own
  // (different) public_slug. No serie.
  rowsBrevet2023[0] = {
    examType: 'brevet', examYear: 2023, examNo: eno(1), nameFr: 'Ahmed Ould Mohamed', nameAr: 'أحمد ولد محمد',
    serie: null, moyenne: '11.20', decision: 'Admis', decisionRaw: 'Admis',
    importId: iidBrevet23,
  };

  await db.insert(attempts).values([...rows2022, ...rows2023, ...rows2024, ...rowsBrevet2023]);

  // ---- Summary -------------------------------------------------------------

  const [countRow] = await db.select({ n: sql<string>`count(*)` }).from(attempts);
  console.log(
    `Done — ${countRow?.n ?? '0'} attempts. Bac 2022/2023 published, Bac 2024 unpublished; ` +
      `Brevet 2023 published (overlaps Bac 2023 exam numbers, no collision).`,
  );
}

main().catch((e: unknown) => { console.error(e); process.exit(1); }).finally(() => pool.end());
