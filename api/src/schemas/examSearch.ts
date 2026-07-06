import { z } from 'zod';
import { EXAM_TYPES } from 'shared';

// Which exam the search is scoped to. Defaults to 'bac' when omitted so old
// links (and the exam-number search's pre-Brevet callers) keep working.
export const examTypeQuerySchema = z.object({
  type: z.enum(EXAM_TYPES).default('bac'),
});

export const examSearchQuerySchema = z.object({
  no: z
    .string()
    .min(1, 'Exam number is required')
    .regex(/^\d+$/, 'Exam number must contain digits only'),
  year: z.coerce
    .number({ invalid_type_error: 'Year must be a number' })
    .int('Year must be an integer')
    .min(1900, 'Year is out of range')
    .max(2100, 'Year is out of range'),
  type: z.enum(EXAM_TYPES).default('bac'),
});

export type ExamSearchQuery = z.infer<typeof examSearchQuerySchema>;
