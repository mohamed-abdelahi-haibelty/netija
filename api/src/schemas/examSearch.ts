import { z } from 'zod';
import { examTypeSchema, MIN_EXAM_YEAR, MAX_EXAM_YEAR } from './common.js';

// Which exam the search is scoped to. Defaults to 'bac' when omitted so old
// links (and the exam-number search's pre-Brevet callers) keep working.
export const examTypeQuerySchema = z.object({
  type: examTypeSchema,
});

export const examSearchQuerySchema = z.object({
  no: z
    .string()
    .min(1, 'Exam number is required')
    .regex(/^\d+$/, 'Exam number must contain digits only'),
  year: z.coerce
    .number({ invalid_type_error: 'Year must be a number' })
    .int('Year must be an integer')
    .min(MIN_EXAM_YEAR, 'Year is out of range')
    .max(MAX_EXAM_YEAR, 'Year is out of range'),
  type: examTypeSchema,
});

export type ExamSearchQuery = z.infer<typeof examSearchQuerySchema>;
