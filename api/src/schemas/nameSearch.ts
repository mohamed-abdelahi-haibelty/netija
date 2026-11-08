import { z } from 'zod';
import { examTypeSchema } from './common.js';

export const nameSearchQuerySchema = z.object({
  q: z.string().min(2, 'Query must be at least 2 characters'),
  type: examTypeSchema,
});
