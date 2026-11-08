/**
 * Guards against a silent drizzle-kit failure mode: `drizzle-orm`'s Postgres
 * migrator (pg-core/dialect.js's `migrate()`) decides which migrations to
 * apply by comparing each journal entry's `when` timestamp against a single
 * snapshot of `MAX(created_at)` already recorded in the DB — it never checks
 * migration hashes. If a newly generated migration's `when` (a plain
 * `Date.now()` at generation time) happens to be LESS than an already-applied
 * migration's `when`, drizzle-kit reports "migrations applied successfully"
 * while silently applying nothing. This has already happened once in this
 * repo (see progress-tracker.md, task 019) because this sandboxed dev
 * environment's clock is not guaranteed monotonic across sessions.
 *
 * This script makes that failure mode loud instead of silent: it verifies
 * `drizzle/meta/_journal.json`'s `when` values are strictly increasing in
 * file order, and with `--fix` repairs any violation by clamping each
 * offending entry to `previous + 1` (minimal change, preserves real
 * timestamps everywhere they were already fine) — then, for any entry that
 * has already been applied (matched by the same sha256 hash drizzle itself
 * uses), updates its `created_at` in `drizzle.__drizzle_migrations` to match,
 * so the bookkeeping table and the journal never disagree.
 *
 * Usage (from api/):
 *   npm run db:check-journal          # verify only, exit 1 on violation
 *   npm run db:fix-journal            # verify + repair + sync the DB
 *
 * Wired into `db:generate` so a bad timestamp is caught the moment it's
 * introduced, not the next time someone runs `db:migrate` and gets a
 * false "success".
 */

import { config } from 'dotenv';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

const DRIZZLE_DIR = resolve(process.cwd(), 'drizzle');
const JOURNAL_PATH = resolve(DRIZZLE_DIR, 'meta', '_journal.json');

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function loadJournal(): Journal {
  return JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')) as Journal;
}

// Same hash drizzle-orm's migrator computes (migrator.js): sha256 of the
// migration file's raw content, before splitting on statement-breakpoints.
function hashForEntry(entry: JournalEntry): string {
  const sqlPath = resolve(DRIZZLE_DIR, `${entry.tag}.sql`);
  return sha256(readFileSync(sqlPath, 'utf8'));
}

// Clamps each entry's `when` to be strictly greater than the previous
// (corrected) one, only where needed — entries already in order keep their
// original value untouched.
function findViolationsAndFix(journal: Journal): { fixed: boolean; changed: JournalEntry[] } {
  const changed: JournalEntry[] = [];
  let previous = -Infinity;
  for (const entry of journal.entries) {
    if (entry.when <= previous) {
      const corrected = previous + 1;
      console.log(
        `  entry ${String(entry.idx)} (${entry.tag}): when ${String(entry.when)} <= previous ${String(previous)} -> ${String(corrected)}`,
      );
      entry.when = corrected;
      changed.push(entry);
    }
    previous = entry.when;
  }
  return { fixed: changed.length > 0, changed };
}

async function syncDatabase(changed: JournalEntry[]): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.log('DATABASE_URL not set — skipping DB sync (journal file is fixed either way).');
    return;
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'drizzle' and tablename = '__drizzle_migrations'`,
    );
    if (rows.length === 0) {
      console.log('drizzle.__drizzle_migrations does not exist yet — nothing to sync.');
      return;
    }

    for (const entry of changed) {
      const hash = hashForEntry(entry);
      const result = await client.query(
        `update drizzle.__drizzle_migrations set created_at = $1 where hash = $2`,
        [entry.when, hash],
      );
      if (result.rowCount && result.rowCount > 0) {
        console.log(`  synced DB row for ${entry.tag} (hash ${hash.slice(0, 12)}...) -> created_at ${String(entry.when)}`);
      }
    }
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const shouldFix = process.argv.includes('--fix');

  if (!existsSync(JOURNAL_PATH)) {
    console.error(`No journal found at ${JOURNAL_PATH}`);
    process.exit(1);
  }

  const journal = loadJournal();
  const { fixed, changed } = findViolationsAndFix(journal);

  if (!fixed) {
    console.log('Migration journal timestamps are strictly increasing. Nothing to fix.');
    return;
  }

  if (!shouldFix) {
    console.error(
      `\n${String(changed.length)} migration journal entr${changed.length === 1 ? 'y is' : 'ies are'} out of order ` +
        `(see above). drizzle-kit will silently skip pending migrations when this happens — run "npm run db:fix-journal" to repair it.`,
    );
    process.exit(1);
  }

  writeFileSync(JOURNAL_PATH, JSON.stringify(journal, null, 2) + '\n');
  console.log(`Rewrote ${JOURNAL_PATH}.`);
  await syncDatabase(changed);
  console.log('Done.');
}

// Load env the same way the other scripts do (root .env, api/ as cwd).
config({ path: resolve(process.cwd(), '../.env') });

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
