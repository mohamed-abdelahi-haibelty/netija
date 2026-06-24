/**
 * Development/staging seed script.
 * Populates the database with realistic fake data covering all scenarios
 * required for building the public read path (tasks 007–012).
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
import { computeMatchKey } from '../src/db/match-key.js';

// ---------------------------------------------------------------------------
// Environment — load before creating the pool (schema import is safe; it
// does not access env vars at module load time)
// ---------------------------------------------------------------------------

// Try project-root .env first, then one level up (when running from api/)
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

const { attempts, imports, linkSuggestions, personLinks, persons } = schema;

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

const SERIES = ['SN', 'LM', 'LO', 'M', 'TM', 'TS', 'LA'] as const;

const BIRTH_PLACES = [
  'Nouakchott', 'Nouadhibou', 'Rosso', 'Kaédi', 'Kiffa',
  'Atar', 'Zouerate', 'Néma', 'Sélibaby', 'Tidjikja',
];

// All normalized decision values paired with realistic raw source strings
const DECISION_POOL = [
  { decision: 'Admis' as const,       decisionRaw: 'Admis' },
  { decision: 'Admis' as const,       decisionRaw: 'Admis Sn' },
  { decision: 'Ajourné' as const,     decisionRaw: 'Ajourné' },
  { decision: 'Ajourné' as const,     decisionRaw: 'Ajourné(e)' },
  { decision: 'Ajourné' as const,     decisionRaw: 'Ajourné Sn' },
  { decision: 'Sessionnaire' as const, decisionRaw: 'Sessionnaire' },
  { decision: 'Sessionnaire' as const, decisionRaw: 'Sessionaire' },
  { decision: 'Absent' as const,      decisionRaw: 'Absent' },
  { decision: 'Absent' as const,      decisionRaw: 'Abscent' },
  { decision: 'Délibérable' as const, decisionRaw: 'Délibérable' },
  { decision: 'Délibérable' as const, decisionRaw: 'Delibérable' },
  { decision: 'Annulé' as const,      decisionRaw: 'Examen annulé CT (Usage du Téléphone)' },
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
  return arr[i % arr.length]!;
}

function eno(n: number): string {
  return String(n).padStart(5, '0');
}

function bDate(i: number): string {
  const year = 2000 + (i % 6);
  const month = (i % 12) + 1;
  const day = (i % 27) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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

// ---------------------------------------------------------------------------
// Bulk single-year helper — inserts `count` new persons each with one attempt
// ---------------------------------------------------------------------------

async function seedSingleYear(
  year: number,
  importId: number,
  startNo: number,
  count: number,
  offset: number,   // deterministic variation across cohorts
): Promise<void> {
  const personRows = await db
    .insert(persons)
    .values(
      Array.from({ length: count }, (_, i) => {
        const s = offset + i;
        const kind = s % 5; // 0,1,2,3 = FR; 4 = AR; 5 = bilingual — (5 not reachable here)
        return {
          nameFr: kind !== 4 ? frName(s) : null,
          nameAr: kind === 4 || kind === 2 ? arName(s) : null,
        };
      }),
    )
    .returning();

  const attemptRows = await db
    .insert(attempts)
    .values(
      personRows.map((p, i) => {
        const s = offset + i;
        const dec = pick(DECISION_POOL, s);
        const bd = bDate(s);
        const bp = pick(BIRTH_PLACES, s);
        const name = p.nameFr ?? p.nameAr ?? '';
        return {
          examYear: year,
          examNo: eno(startNo + i),
          nameFr: p.nameFr,
          nameAr: p.nameAr,
          birthDate: bd,
          birthPlace: bp,
          serie: pick(SERIES, s),
          moyenne: moy(dec.decision, s),
          decision: dec.decision,
          decisionRaw: dec.decisionRaw,
          matchKey: name ? computeMatchKey(name, bd, bp) : null,
          importId,
        };
      }),
    )
    .returning();

  await db.insert(personLinks).values(
    attemptRows.map((a, i) => ({
      attemptId: a.id,
      personId: personRows[i]!.id,
      method: 'match_key' as const,
    })),
  );
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
    const [{ n: aCount }] = await db.select({ n: sql<string>`count(*)` }).from(attempts);
    const [{ n: pCount }] = await db.select({ n: sql<string>`count(*)` }).from(persons);
    console.log(`Seed already applied — ${aCount} attempts, ${pCount} persons. Nothing to do.`);
    return;
  }

  console.log('Seeding…');

  // ---- 1. Import rows -------------------------------------------------------
  // 2022 and 2023: published. 2024: unpublished (for future publish-flow work).

  const [imp2022, imp2023, imp2024] = await db
    .insert(imports)
    .values([
      {
        originalFilename: 'seed/2022', filePath: 'seed/2022',
        status: 'completed', examYear: 2022,
        summaryInserted: 99, summaryRejected: 0, summaryNewPeople: 99,
        summaryDuplicatesSkipped: 0, smokePassed: true, published: true,
      },
      {
        originalFilename: 'seed/2023', filePath: 'seed/2023',
        status: 'completed', examYear: 2023,
        summaryInserted: 99, summaryRejected: 0, summaryNewPeople: 94,
        summaryDuplicatesSkipped: 0, smokePassed: true, published: true,
      },
      {
        originalFilename: 'seed/2024', filePath: 'seed/2024',
        status: 'completed', examYear: 2024,
        summaryInserted: 100, summaryRejected: 0, summaryNewPeople: 100,
        summaryDuplicatesSkipped: 0, smokePassed: true, published: false,
      },
    ])
    .returning();

  const iid22 = imp2022!.id;
  const iid23 = imp2023!.id;
  const iid24 = imp2024!.id;

  // ---- 2. Special scenario persons + attempts + links ----------------------

  // S1 — Redemption: Ajourné(2022) → Admis(2023), linked by NNI across years.
  const [pRedemption] = await db
    .insert(persons)
    .values({ nameFr: 'Ahmed Ould Mohamed', nameAr: 'أحمد ولد محمد' })
    .returning();
  const s1Bd = '2002-06-15', s1Bp = 'Nouakchott', s1Nni = '1000000001';
  const [a22s1] = await db.insert(attempts).values({
    examYear: 2022, examNo: eno(1), nni: s1Nni,
    nameFr: 'Ahmed Ould Mohamed', nameAr: 'أحمد ولد محمد',
    birthDate: s1Bd, birthPlace: s1Bp, serie: 'SN',
    moyenne: '10.50', decision: 'Ajourné', decisionRaw: 'Ajourné(e)',
    matchKey: computeMatchKey('Ahmed Ould Mohamed', s1Bd, s1Bp), importId: iid22,
  }).returning();
  const [a23s1] = await db.insert(attempts).values({
    examYear: 2023, examNo: eno(1), nni: s1Nni,
    nameFr: 'Ahmed Ould Mohamed', nameAr: 'أحمد ولد محمد',
    birthDate: s1Bd, birthPlace: s1Bp, serie: 'SN',
    moyenne: '12.75', decision: 'Admis', decisionRaw: 'Admis Sn',
    matchKey: computeMatchKey('Ahmed Ould Mohamed', s1Bd, s1Bp), importId: iid23,
  }).returning();
  await db.insert(personLinks).values([
    { attemptId: a22s1!.id, personId: pRedemption!.id, method: 'nni' },
    { attemptId: a23s1!.id, personId: pRedemption!.id, method: 'nni' },
  ]);

  // S2 — Same name, born Nouakchott (one side of the link_suggestion pair).
  const [pSameNkt] = await db
    .insert(persons)
    .values({ nameFr: 'Mohamed Ould Ahmed', nameAr: null })
    .returning();
  const s2Bd = '2001-05-10';
  const [a22s2] = await db.insert(attempts).values({
    examYear: 2022, examNo: eno(2),
    nameFr: 'Mohamed Ould Ahmed', birthDate: s2Bd, birthPlace: 'Nouakchott',
    serie: 'LM', moyenne: '13.00', decision: 'Admis', decisionRaw: 'Admis',
    matchKey: computeMatchKey('Mohamed Ould Ahmed', s2Bd, 'Nouakchott'), importId: iid22,
  }).returning();
  await db.insert(personLinks).values({ attemptId: a22s2!.id, personId: pSameNkt!.id, method: 'match_key' });

  // S3 — Same name, born Nouadhibou (other side; different place → separate person).
  const [pSameNdb] = await db
    .insert(persons)
    .values({ nameFr: 'Mohamed Ould Ahmed', nameAr: null })
    .returning();
  const [a22s3] = await db.insert(attempts).values({
    examYear: 2022, examNo: eno(3),
    nameFr: 'Mohamed Ould Ahmed', birthDate: s2Bd, birthPlace: 'Nouadhibou',
    serie: 'LM', moyenne: '9.25', decision: 'Ajourné', decisionRaw: 'Ajourné',
    // No matchKey — birth_place differs, so these are genuinely different people
    importId: iid22,
  }).returning();
  await db.insert(personLinks).values({ attemptId: a22s3!.id, personId: pSameNdb!.id, method: 'match_key' });

  // S4 — Arabic-only name.
  const [pArOnly] = await db
    .insert(persons)
    .values({ nameFr: null, nameAr: 'فاطمة بنت عبد الله' })
    .returning();
  const [a22s4] = await db.insert(attempts).values({
    examYear: 2022, examNo: eno(4),
    nameAr: 'فاطمة بنت عبد الله',
    serie: 'M', moyenne: '10.25', decision: 'Sessionnaire', decisionRaw: 'Sessionnaire',
    importId: iid22,
  }).returning();
  await db.insert(personLinks).values({ attemptId: a22s4!.id, personId: pArOnly!.id, method: 'manual' });

  // S5 — French-only name.
  const [pFrOnly] = await db
    .insert(persons)
    .values({ nameFr: 'Marie Dupont', nameAr: null })
    .returning();
  const [a22s5] = await db.insert(attempts).values({
    examYear: 2022, examNo: eno(5),
    nameFr: 'Marie Dupont',
    serie: 'LA', moyenne: '7.50', decision: 'Absent', decisionRaw: 'Abscent',
    importId: iid22,
  }).returning();
  await db.insert(personLinks).values({ attemptId: a22s5!.id, personId: pFrOnly!.id, method: 'manual' });

  // S6 — Bilingual name, Délibérable (2023).
  const [pBilingual] = await db
    .insert(persons)
    .values({ nameFr: 'Mariem Mint Salem', nameAr: 'مريم بنت سالم' })
    .returning();
  const [a23s6] = await db.insert(attempts).values({
    examYear: 2023, examNo: eno(2),
    nameFr: 'Mariem Mint Salem', nameAr: 'مريم بنت سالم',
    birthDate: '2002-11-20', birthPlace: 'Kiffa', serie: 'TM',
    moyenne: '9.75', decision: 'Délibérable', decisionRaw: 'Délibérable',
    matchKey: computeMatchKey('Mariem Mint Salem', '2002-11-20', 'Kiffa'), importId: iid23,
  }).returning();
  await db.insert(personLinks).values({ attemptId: a23s6!.id, personId: pBilingual!.id, method: 'match_key' });

  // S7 — match_key cross-year link (no NNI; same name+date+place links 2022→2023).
  const [pMkLink] = await db
    .insert(persons)
    .values({ nameFr: 'Oumar Ba', nameAr: 'عمر با' })
    .returning();
  const s7Bd = '2002-03-10', s7Bp = 'Rosso';
  const s7Mk = computeMatchKey('Oumar Ba', s7Bd, s7Bp);
  const [a22s7] = await db.insert(attempts).values({
    examYear: 2022, examNo: eno(6),
    nameFr: 'Oumar Ba', nameAr: 'عمر با',
    birthDate: s7Bd, birthPlace: s7Bp, serie: 'TS',
    moyenne: '8.00', decision: 'Ajourné', decisionRaw: 'Ajourné',
    matchKey: s7Mk, importId: iid22,
  }).returning();
  const [a23s7] = await db.insert(attempts).values({
    examYear: 2023, examNo: eno(3),
    nameFr: 'Oumar Ba', nameAr: 'عمر با',
    birthDate: s7Bd, birthPlace: s7Bp, serie: 'TS',
    moyenne: '11.50', decision: 'Admis', decisionRaw: 'Admis',
    matchKey: s7Mk, importId: iid23,
  }).returning();
  await db.insert(personLinks).values([
    { attemptId: a22s7!.id, personId: pMkLink!.id, method: 'match_key' },
    { attemptId: a23s7!.id, personId: pMkLink!.id, method: 'match_key' },
  ]);

  // S8 — Annulé decision with realistic raw value.
  const [pAnnule] = await db
    .insert(persons)
    .values({ nameFr: 'Sidi Mohamed Ould Brahim', nameAr: null })
    .returning();
  const [a22s8] = await db.insert(attempts).values({
    examYear: 2022, examNo: eno(7),
    nameFr: 'Sidi Mohamed Ould Brahim',
    serie: 'LO', decision: 'Annulé',
    decisionRaw: 'Examen annulé CT (Usage du Téléphone)', importId: iid22,
  }).returning();
  await db.insert(personLinks).values({ attemptId: a22s8!.id, personId: pAnnule!.id, method: 'manual' });

  // ---- 3. Cross-year NNI-linked bulk (10 persons, in 2022 and 2023) --------

  const nniPersons = await db
    .insert(persons)
    .values(
      Array.from({ length: 10 }, (_, i) => ({
        nameFr: frName(i + 20),
        nameAr: i % 2 === 0 ? arName(i + 20) : null,
      })),
    )
    .returning();

  const nniBd = Array.from({ length: 10 }, (_, i) => bDate(i + 30));
  const nniBp = Array.from({ length: 10 }, (_, i) => pick(BIRTH_PLACES, i + 2));

  const nniA22 = await db
    .insert(attempts)
    .values(
      nniPersons.map((p, i) => {
        const dec = pick(DECISION_POOL, i + 10);
        const nni = String(1000001000 + i);
        return {
          examYear: 2022, examNo: eno(8 + i), nni,
          nameFr: p.nameFr, nameAr: p.nameAr,
          birthDate: nniBd[i]!, birthPlace: nniBp[i]!,
          serie: pick(SERIES, i + 1),
          moyenne: moy(dec.decision, i + 30),
          decision: dec.decision, decisionRaw: dec.decisionRaw,
          matchKey: p.nameFr ? computeMatchKey(p.nameFr, nniBd[i]!, nniBp[i]!) : null,
          importId: iid22,
        };
      }),
    )
    .returning();

  const nniA23 = await db
    .insert(attempts)
    .values(
      nniPersons.map((p, i) => {
        const dec = pick(DECISION_POOL, i + 2);
        const nni = String(1000001000 + i);
        return {
          examYear: 2023, examNo: eno(4 + i), nni,
          nameFr: p.nameFr, nameAr: p.nameAr,
          birthDate: nniBd[i]!, birthPlace: nniBp[i]!,
          serie: pick(SERIES, i + 1),
          moyenne: moy(dec.decision, i + 40),
          decision: dec.decision, decisionRaw: dec.decisionRaw,
          matchKey: p.nameFr ? computeMatchKey(p.nameFr, nniBd[i]!, nniBp[i]!) : null,
          importId: iid23,
        };
      }),
    )
    .returning();

  await db.insert(personLinks).values([
    ...nniA22.map((a, i) => ({ attemptId: a.id, personId: nniPersons[i]!.id, method: 'nni' as const })),
    ...nniA23.map((a, i) => ({ attemptId: a.id, personId: nniPersons[i]!.id, method: 'nni' as const })),
  ]);

  // ---- 4. Cross-year match_key-linked bulk (5 persons, in 2022 and 2023) --

  const mkPersons = await db
    .insert(persons)
    .values(
      Array.from({ length: 5 }, (_, i) => ({
        nameFr: frName(i + 50),
        nameAr: arName(i + 50),
      })),
    )
    .returning();

  const mkBd = Array.from({ length: 5 }, (_, i) => bDate(i + 60));
  const mkBp = Array.from({ length: 5 }, (_, i) => pick(BIRTH_PLACES, i + 5));

  const mkA22 = await db
    .insert(attempts)
    .values(
      mkPersons.map((p, i) => {
        const dec = pick(DECISION_POOL, i + 5);
        return {
          examYear: 2022, examNo: eno(18 + i),
          nameFr: p.nameFr, nameAr: p.nameAr,
          birthDate: mkBd[i]!, birthPlace: mkBp[i]!,
          serie: pick(SERIES, i + 3),
          moyenne: moy(dec.decision, i + 50),
          decision: dec.decision, decisionRaw: dec.decisionRaw,
          matchKey: computeMatchKey(p.nameFr!, mkBd[i]!, mkBp[i]!),
          importId: iid22,
        };
      }),
    )
    .returning();

  const mkA23 = await db
    .insert(attempts)
    .values(
      mkPersons.map((p, i) => {
        const dec = pick(DECISION_POOL, i + 1);
        return {
          examYear: 2023, examNo: eno(14 + i),
          nameFr: p.nameFr, nameAr: p.nameAr,
          birthDate: mkBd[i]!, birthPlace: mkBp[i]!,
          serie: pick(SERIES, i + 3),
          moyenne: moy(dec.decision, i + 60),
          decision: dec.decision, decisionRaw: dec.decisionRaw,
          matchKey: computeMatchKey(p.nameFr!, mkBd[i]!, mkBp[i]!),
          importId: iid23,
        };
      }),
    )
    .returning();

  await db.insert(personLinks).values([
    ...mkA22.map((a, i) => ({ attemptId: a.id, personId: mkPersons[i]!.id, method: 'match_key' as const })),
    ...mkA23.map((a, i) => ({ attemptId: a.id, personId: mkPersons[i]!.id, method: 'match_key' as const })),
  ]);

  // ---- 5. Single-year bulk -------------------------------------------------
  // 2022: examNos 23–99 → 77 persons (offset 70)
  // 2023: examNos 19–99 → 81 persons (offset 150)
  // 2024: examNos  1–100 → 100 persons (offset 250); all unpublished

  await seedSingleYear(2022, iid22, 23, 77, 70);
  await seedSingleYear(2023, iid23, 19, 81, 150);
  await seedSingleYear(2024, iid24, 1, 100, 250);

  // ---- 6. Pending link_suggestion ------------------------------------------
  // S2 (Nouakchott) and S3 (Nouadhibou) share name "Mohamed Ould Ahmed" and
  // birth date 2001-05-10 but differ in birth place → flagged for human review.

  await db.insert(linkSuggestions).values({
    attemptId: a22s3!.id,
    personId: pSameNkt!.id,
    reason: 'same_name_same_birth_date_different_birth_place',
    status: 'pending',
  });

  // ---- Summary -------------------------------------------------------------

  const [{ n: aCount }] = await db.select({ n: sql<string>`count(*)` }).from(attempts);
  const [{ n: pCount }] = await db.select({ n: sql<string>`count(*)` }).from(persons);
  const [{ n: lCount }] = await db.select({ n: sql<string>`count(*)` }).from(personLinks);
  const [{ n: sCount }] = await db.select({ n: sql<string>`count(*)` }).from(linkSuggestions);

  console.log(
    `Done — ${aCount} attempts · ${pCount} persons · ${lCount} person_links · ${sCount} link_suggestion(s).`,
  );
}

main().catch((e: unknown) => { console.error(e); process.exit(1); }).finally(() => pool.end());
