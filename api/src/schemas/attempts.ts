import { z } from 'zod';
import { decisionEnum } from '../db/schema.js';
import { paginationSchema } from './common.js';

export const DEFAULT_ATTEMPTS_PAGE_SIZE = 50;
export const MAX_ATTEMPTS_PAGE_SIZE = 200;

export const listImportAttemptsQuerySchema = z.object({
  ...paginationSchema({
    defaultPageSize: DEFAULT_ATTEMPTS_PAGE_SIZE,
    maxPageSize: MAX_ATTEMPTS_PAGE_SIZE,
  }),
  search: z.string().trim().min(1).optional(),
  serie: z.string().trim().min(1).optional(),
  decision: z.enum(decisionEnum.enumValues).optional(),
});

export type ListImportAttemptsQuery = z.infer<typeof listImportAttemptsQuerySchema>;

// A single deletion is just a one-element array through the same endpoint
// (task 033: "delete a single attempt, or several selected attempts, in one
// action"). Capped well above any realistic bulk-selection size but still
// bounded, so a malformed client can't force an unbounded IN (...) clause.
export const deleteImportAttemptsBodySchema = z.object({
  attemptIds: z
    .array(z.number().int('attemptIds must be integers').positive('attemptIds must be positive'))
    .min(1, 'attemptIds must contain at least one id')
    .max(5000, 'attemptIds must contain at most 5000 ids'),
});

export type DeleteImportAttemptsBody = z.infer<typeof deleteImportAttemptsBodySchema>;
