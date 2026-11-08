import { z } from 'zod';
import { EXAM_TYPES } from 'shared';
import { MIN_EXAM_YEAR, MAX_EXAM_YEAR } from './common.js';

// The 6 canonical fields the pipeline ever stores (shared/src/imports.ts's
// CanonicalField) — kept as a literal tuple here since Zod needs its own
// enum declaration, not an imported type.
const CANONICAL_FIELDS = ['exam_no', 'name_fr', 'name_ar', 'serie', 'moyenne', 'decision'] as const;

export const confirmImportBodySchema = z.object({
  mapping: z
    .record(z.string().min(1), z.enum(CANONICAL_FIELDS))
    .refine((m) => Object.keys(m).length > 0, { message: 'mapping must not be empty' }),
  // The admin picks the exam type alongside the year on the mapping screen.
  examType: z.enum(EXAM_TYPES),
  examYear: z.coerce
    .number({ invalid_type_error: 'examYear must be a number' })
    .int('examYear must be an integer')
    .min(MIN_EXAM_YEAR, `examYear must be ${String(MIN_EXAM_YEAR)} or later`)
    .max(MAX_EXAM_YEAR, `examYear must be ${String(MAX_EXAM_YEAR)} or earlier`),
});

export type ConfirmImportBody = z.infer<typeof confirmImportBodySchema>;
