import { z } from 'zod';
import { paginationSchema } from './common.js';

export const DEFAULT_SEARCH_INDEX_PAGE_SIZE = 20;
export const MAX_SEARCH_INDEX_PAGE_SIZE = 100;

// Inspection is either scoped to one import, a free-text query (the same
// search admins can run publicly), or neither (a plain browse of the index).
// Never both at once — that's an ambiguous request, not a combined filter.
export const listSearchIndexDocumentsQuerySchema = z
  .object({
    importId: z.coerce.number().int('importId must be an integer').positive('importId must be positive').optional(),
    q: z.string().trim().min(1).optional(),
    ...paginationSchema({
      defaultPageSize: DEFAULT_SEARCH_INDEX_PAGE_SIZE,
      maxPageSize: MAX_SEARCH_INDEX_PAGE_SIZE,
    }),
  })
  .refine((v) => v.importId === undefined || v.q === undefined, {
    message: 'Provide either importId or q, not both',
    path: ['q'],
  });

export type ListSearchIndexDocumentsQuery = z.infer<typeof listSearchIndexDocumentsQuerySchema>;
