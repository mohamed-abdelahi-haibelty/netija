import { z } from 'zod';

export const DEFAULT_SEARCH_INDEX_PAGE_SIZE = 20;
export const MAX_SEARCH_INDEX_PAGE_SIZE = 100;

// Inspection is either scoped to one import, a free-text query (the same
// search admins can run publicly), or neither (a plain browse of the index).
// Never both at once — that's an ambiguous request, not a combined filter.
export const listSearchIndexDocumentsQuerySchema = z
  .object({
    importId: z.coerce.number().int('importId must be an integer').positive('importId must be positive').optional(),
    q: z.string().trim().min(1).optional(),
    page: z.coerce.number().int('page must be an integer').positive('page must be positive').default(1),
    pageSize: z.coerce
      .number()
      .int('pageSize must be an integer')
      .positive('pageSize must be positive')
      .max(MAX_SEARCH_INDEX_PAGE_SIZE, `pageSize must be at most ${String(MAX_SEARCH_INDEX_PAGE_SIZE)}`)
      .default(DEFAULT_SEARCH_INDEX_PAGE_SIZE),
  })
  .refine((v) => v.importId === undefined || v.q === undefined, {
    message: 'Provide either importId or q, not both',
    path: ['q'],
  });

export type ListSearchIndexDocumentsQuery = z.infer<typeof listSearchIndexDocumentsQuerySchema>;
