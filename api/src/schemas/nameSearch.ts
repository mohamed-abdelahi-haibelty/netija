import { z } from 'zod';

export const nameSearchQuerySchema = z.object({
  q: z.string().min(2, 'Query must be at least 2 characters'),
});
