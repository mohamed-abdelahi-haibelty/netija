import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const decisionEnum = pgEnum('decision', [
  'Admis',
  'Ajourné',
  'Sessionnaire',
  'Absent',
  'Délibérable',
  'Annulé',
]);

export const importStatusEnum = pgEnum('import_status', [
  'pending',
  'processing',
  'cancelling',
  'completed',
  'cancelled',
  'failed',
]);

// Discriminates the exam a result belongs to. 'bac' is the Baccalauréat;
// 'brevet' is the Brevet (BEPC — "Examen du Brevet" / مسابقة ختم دروس
// الإعدادية). Both share the same fields and pipeline; the only structural
// difference is that Brevet has no serie (track), so serie is nullable and
// its presence is enforced per-type in validation, not by the column.
export const examTypeEnum = pgEnum('exam_type', ['bac', 'brevet']);

// ---------------------------------------------------------------------------
// imports — one row per uploaded file, tracks full lifecycle
// ---------------------------------------------------------------------------

export const imports = pgTable('imports', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  originalFilename: text('original_filename').notNull(),
  filePath: text('file_path').notNull(),
  status: importStatusEnum('status').notNull().default('pending'),
  // Which exam this file's rows belong to. Nullable until confirm, exactly
  // like examYear: an uploaded-but-unconfirmed import has neither yet — the
  // admin chooses both on the mapping/confirm screen.
  examType: examTypeEnum('exam_type'),
  examYear: integer('exam_year'),
  // 0-100, set by the queue worker as the job progresses; null before the
  // job starts running (see the status endpoint, task 019).
  progress: integer('progress'),
  summaryInserted: integer('summary_inserted'),
  summaryRejected: integer('summary_rejected'),
  summaryDuplicatesSkipped: integer('summary_duplicates_skipped'),
  smokePassed: boolean('smoke_passed'),
  published: boolean('published').notNull().default(false),
  failureReason: text('failure_reason'),
  // The OS pid of the currently-running worker/worker.py subprocess (task
  // 032) — set by the queue worker right after spawning, cleared when it
  // exits. Lets a cancel request signal a specific run's process from a
  // DIFFERENT Node process (the API server, not the queue worker) on the
  // same host, for a genuinely stuck import that isn't reaching one of the
  // loader's cooperative cancellation checkpoints.
  workerPid: integer('worker_pid'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// attempts — one immutable row per exam sitting; the ONLY result-bearing
// table and the source of truth. A "result" is a single attempt row; there
// is no person concept and no identity linking across years.
// ---------------------------------------------------------------------------

export const attempts = pgTable(
  'attempts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    // 'bac' | 'brevet' — the discriminator that lets a Bac and a Brevet
    // candidate share the same (exam_year, exam_no) without colliding.
    examType: examTypeEnum('exam_type').notNull(),
    examYear: integer('exam_year').notNull(),
    // TEXT, not numeric — leading zeros must be preserved
    examNo: text('exam_no').notNull(),
    // Random, unguessable handle used ONLY in public URLs (/{lang}/results/{slug})
    // so result pages can't be enumerated the way sequential exam numbers can.
    // The internal identity remains (exam_year, exam_no); this is a display alias.
    // DB-side DEFAULT so every inserter (seed, Python loader, admin, manual SQL)
    // self-populates it without application code.
    publicSlug: text('public_slug')
      .notNull()
      .default(sql`replace(gen_random_uuid()::text, '-', '')`),
    nameFr: text('name_fr'),
    nameAr: text('name_ar'),
    // Nullable: required for Bac, absent for Brevet. The "required for bac,
    // ignored for brevet" rule is enforced per-type in cleaning validation
    // (worker/cleaning.py); this nullable column is the DB backstop behind
    // that, not the first line of defense.
    serie: text('serie'),
    // Nullable — absent for Annulé (cancelled exam) attempts
    moyenne: numeric('moyenne', { precision: 4, scale: 2 }),
    decision: decisionEnum('decision').notNull(),
    decisionRaw: text('decision_raw'),
    importId: bigint('import_id', { mode: 'number' })
      .notNull()
      .references(() => imports.id),
  },
  (t) => [
    // Exam numbers are only unique within a (type, year): a Bac and a Brevet
    // candidate may legitimately share the same year + exam_no. The loader's
    // ON CONFLICT clause (worker/loader.py) targets these same three columns.
    uniqueIndex('attempts_exam_type_year_no_unique').on(t.examType, t.examYear, t.examNo),
    uniqueIndex('attempts_public_slug_unique').on(t.publicSlug),
  ],
);

// ---------------------------------------------------------------------------
// rejects — rows that failed import validation, kept for audit
// ---------------------------------------------------------------------------

export const rejects = pgTable('rejects', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  importId: bigint('import_id', { mode: 'number' })
    .notNull()
    .references(() => imports.id),
  rowNumber: integer('row_number').notNull(),
  rawData: jsonb('raw_data').notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// column_aliases — learned header → canonical field mappings
// ---------------------------------------------------------------------------

export const columnAliases = pgTable('column_aliases', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  rawHeader: text('raw_header').notNull().unique(),
  canonicalField: text('canonical_field').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Better Auth tables — auth_user, auth_session, auth_account, auth_verification
// Prefixed with auth_ to avoid conflicts with PostgreSQL reserved identifiers.
// ---------------------------------------------------------------------------

export const authUser = pgTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const authSession = pgTable('auth_session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
});

export const authAccount = pgTable('auth_account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const authVerification = pgTable('auth_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});
