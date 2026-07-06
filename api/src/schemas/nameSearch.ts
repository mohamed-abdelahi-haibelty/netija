import { z } from 'zod';
import { EXAM_TYPES } from 'shared';

export const nameSearchQuerySchema = z.object({
  q: z.string().min(2, 'Query must be at least 2 characters'),
  type: z.enum(EXAM_TYPES).default('bac'),
});
