import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { imports, rejects } from '../db/schema.js';

// One row per rejected record: its row number within the source file, why
// it failed cleaning, and the raw column values kept for audit
// (architecture.md: "rejects — per-import rejected rows with reasons, raw
// row kept for audit").
export interface RejectReportRow {
  rowNumber: number;
  reason: string;
  rawData: Record<string, unknown>;
}

// Returns null when the import id doesn't exist (route -> 404); an empty
// array is a valid result (a real import that rejected nothing).
export async function getRejectReport(
  db: Db,
  importId: number,
): Promise<RejectReportRow[] | null> {
  const [importRow] = await db
    .select({ id: imports.id })
    .from(imports)
    .where(eq(imports.id, importId))
    .limit(1);
  if (!importRow) return null;

  const rows = await db
    .select({ rowNumber: rejects.rowNumber, reason: rejects.reason, rawData: rejects.rawData })
    .from(rejects)
    .where(eq(rejects.importId, importId))
    .orderBy(asc(rejects.rowNumber));

  return rows.map((r) => ({
    rowNumber: r.rowNumber,
    reason: r.reason,
    rawData: r.rawData as Record<string, unknown>,
  }));
}

function csvField(value: string): string {
  // Quote whenever the value could otherwise break the CSV grid (a comma,
  // quote, or newline); doubling an embedded quote is the standard CSV
  // escape.
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// One column per source header would mean a different schema per historical
// file format (architecture.md: "never trust the file's schema"), so the raw
// row is flattened into a single JSON field instead of inventing a fixed set
// of reject-report columns.
export function toRejectReportCsv(rows: RejectReportRow[]): string {
  const lines = rows.map((r) =>
    [String(r.rowNumber), csvField(r.reason), csvField(JSON.stringify(r.rawData))].join(','),
  );
  return ['row_number,reason,raw_data', ...lines].join('\n') + '\n';
}
