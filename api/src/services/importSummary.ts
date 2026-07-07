// Shared by importList.ts and importStatus.ts: an import has no summary
// until its job has actually run (summaryInserted stays null until then).
export function toImportSummary(row: {
  summaryInserted: number | null;
  summaryRejected: number | null;
  summaryDuplicatesSkipped: number | null;
}): { inserted: number; rejected: number; duplicatesSkipped: number } | null {
  if (row.summaryInserted === null) return null;
  return {
    inserted: row.summaryInserted,
    rejected: row.summaryRejected ?? 0,
    duplicatesSkipped: row.summaryDuplicatesSkipped ?? 0,
  };
}
