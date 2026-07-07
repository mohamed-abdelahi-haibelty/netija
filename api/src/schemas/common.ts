import { z } from 'zod';
import { EXAM_TYPES } from 'shared';

export const MIN_EXAM_YEAR = 1900;
export const MAX_EXAM_YEAR = 2100;

// Every exam-type-scoped query defaults to 'bac' so old links (and callers
// that predate Brevet) keep working.
export const examTypeSchema = z.enum(EXAM_TYPES).default('bac');

/**
 * The page/pageSize fields shared by every paginated admin list endpoint.
 * Callers spread the result into their own z.object shape alongside their
 * own filter fields, keeping each endpoint's own default/max page size.
 */
export function paginationSchema({
  defaultPageSize,
  maxPageSize,
}: {
  defaultPageSize: number;
  maxPageSize: number;
}) {
  return {
    page: z.coerce.number().int('page must be an integer').positive('page must be positive').default(1),
    pageSize: z.coerce
      .number()
      .int('pageSize must be an integer')
      .positive('pageSize must be positive')
      .max(maxPageSize, `pageSize must be at most ${String(maxPageSize)}`)
      .default(defaultPageSize),
  };
}
