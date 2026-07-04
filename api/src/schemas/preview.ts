import { z } from 'zod';

export const importIdParamSchema = z.object({
  id: z.coerce
    .number({ invalid_type_error: 'Import id must be a number' })
    .int('Import id must be an integer')
    .positive('Import id must be positive'),
});

export type ImportIdParam = z.infer<typeof importIdParamSchema>;
