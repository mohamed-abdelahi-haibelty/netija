import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
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
  'completed',
  'failed',
]);

export const linkMethodEnum = pgEnum('link_method', [
  'nni',
  'match_key',
  'manual',
]);

export const suggestionStatusEnum = pgEnum('suggestion_status', [
  'pending',
  'accepted',
  'rejected',
]);

// ---------------------------------------------------------------------------
// persons — minimal identity anchors; display names cached here
// ---------------------------------------------------------------------------

export const persons = pgTable('persons', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  nameFr: text('name_fr'),
  nameAr: text('name_ar'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// imports — one row per uploaded file, tracks full lifecycle
// ---------------------------------------------------------------------------

export const imports = pgTable('imports', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  originalFilename: text('original_filename').notNull(),
  filePath: text('file_path').notNull(),
  status: importStatusEnum('status').notNull().default('pending'),
  examYear: integer('exam_year'),
  summaryInserted: integer('summary_inserted'),
  summaryRejected: integer('summary_rejected'),
  summaryNewPeople: integer('summary_new_people'),
  summaryDuplicatesSkipped: integer('summary_duplicates_skipped'),
  smokePassed: boolean('smoke_passed'),
  published: boolean('published').notNull().default(false),
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// attempts — one immutable row per exam sitting; the source of truth
// ---------------------------------------------------------------------------

export const attempts = pgTable(
  'attempts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    examYear: integer('exam_year').notNull(),
    // TEXT, not numeric — leading zeros must be preserved
    examNo: text('exam_no').notNull(),
    // 10-digit string when present; absent in some years (e.g. 2022)
    nni: text('nni'),
    nameFr: text('name_fr'),
    nameAr: text('name_ar'),
    birthDate: date('birth_date'),
    birthPlace: text('birth_place'),
    serie: text('serie'),
    // Numeric out of 20
    moyenne: numeric('moyenne', { precision: 4, scale: 2 }),
    decision: decisionEnum('decision'),
    decisionRaw: text('decision_raw'),
    school: text('school'),
    wilaya: text('wilaya'),
    // sha256(normalized_name|birth_date_iso|normalized_birth_place); nullable
    matchKey: text('match_key'),
    importId: bigint('import_id', { mode: 'number' })
      .notNull()
      .references(() => imports.id),
  },
  (t) => [
    uniqueIndex('attempts_exam_year_exam_no_unique').on(t.examYear, t.examNo),
    index('attempts_nni_idx').on(t.nni),
    index('attempts_match_key_idx').on(t.matchKey),
  ],
);

// ---------------------------------------------------------------------------
// person_links — attempt → person mapping; attempt_id UNIQUE (reversible)
// ---------------------------------------------------------------------------

export const personLinks = pgTable(
  'person_links',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    attemptId: bigint('attempt_id', { mode: 'number' })
      .notNull()
      .unique()
      .references(() => attempts.id),
    personId: bigint('person_id', { mode: 'number' })
      .notNull()
      .references(() => persons.id),
    method: linkMethodEnum('method').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('person_links_person_id_idx').on(t.personId)],
);

// ---------------------------------------------------------------------------
// link_suggestions — review queue for looser identity matches (Pass 4)
// ---------------------------------------------------------------------------

export const linkSuggestions = pgTable('link_suggestions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  attemptId: bigint('attempt_id', { mode: 'number' })
    .notNull()
    .references(() => attempts.id),
  personId: bigint('person_id', { mode: 'number' })
    .notNull()
    .references(() => persons.id),
  reason: text('reason').notNull(),
  status: suggestionStatusEnum('status').notNull().default('pending'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: text('resolved_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

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
