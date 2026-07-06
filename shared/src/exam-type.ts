// The exam a result belongs to. 'bac' is the Baccalauréat; 'brevet' is the
// Brevet (BEPC). Both share the same fields, pipeline, and pages; the only
// structural difference is that Brevet has no serie (track). Mirrors
// api/src/db/schema.ts's examTypeEnum. A runtime tuple (not just a type) so
// the web layer can iterate it for the home-page type selector.
export const EXAM_TYPES = ['bac', 'brevet'] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

export function isExamType(value: unknown): value is ExamType {
  return typeof value === 'string' && (EXAM_TYPES as readonly string[]).includes(value);
}
