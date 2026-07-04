import { z } from 'zod';

// The 6 canonical fields the pipeline ever stores (shared/src/imports.ts's
// CanonicalField) — kept as a literal tuple here since Zod needs its own
// enum declaration, not an imported type.
const CANONICAL_FIELDS = ['exam_no', 'name_fr', 'name_ar', 'serie', 'moyenne', 'decision'] as const;

export const confirmImportBodySchema = z.object({
  mapping: z
    .record(z.string().min(1), z.enum(CANONICAL_FIELDS))
    .refine((m) => Object.keys(m).length > 0, { message: 'mapping must not be empty' }),
  examYear: z.coerce
    .number({ invalid_type_error: 'examYear must be a number' })
    .int('examYear must be an integer')
    .min(1900, 'examYear must be 1900 or later')
    .max(2100, 'examYear must be 2100 or earlier'),
});

export type ConfirmImportBody = z.infer<typeof confirmImportBodySchema>;
