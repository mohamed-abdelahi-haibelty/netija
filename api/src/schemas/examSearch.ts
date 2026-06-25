import { z } from 'zod';

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
});

export type ExamSearchQuery = z.infer<typeof examSearchQuerySchema>;
