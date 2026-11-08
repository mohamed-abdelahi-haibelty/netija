import { eq } from 'drizzle-orm';
import { resolve } from 'node:path';
import type { Db } from '../db/client.js';
import { imports, columnAliases } from '../db/schema.js';
import { requiredPathEnv } from '../lib/env.js';
import { runPythonScript } from '../lib/pythonRunner.js';
import type { ImportPreviewColumn, ImportPreviewResult, MissingRequiredField } from 'shared';

const PYTHON_BIN = process.env['PYTHON_BIN'] ?? 'python3';
// Shared volume/sibling package with the worker (see architecture.md).
// Defaults to the repo-root `worker/` folder for local dev, where the api
// process runs with api/ as cwd; required (no fallback) in production —
// same convention as UPLOADS_DIR, see lib/env.ts.
const WORKER_DIR = requiredPathEnv('WORKER_DIR', resolve(process.cwd(), '../worker'));
const PREVIEW_SCRIPT = resolve(WORKER_DIR, 'preview.py');

interface PythonPreviewSuccess {
  ok: true;
  columns: ImportPreviewColumn[];
  missingRequired: MissingRequiredField[];
}

interface PythonPreviewFailure {
  ok: false;
  code: string;
  reason: string;
}

// Thrown when the worker reports the file itself couldn't be read (wrong
// format, corrupted, unsupported despite a valid extension) — an expected,
// user-actionable outcome per error-handling.md's philosophy, not a bug.
// The route turns this into 415 UNSUPPORTED_FILE_TYPE instead of letting it
// fall through to a generic 500 INTERNAL.
export class UnsupportedFileTypeError extends Error {}

export async function getLearnedAliases(db: Db): Promise<Record<string, string>> {
  const rows = await db
    .select({ rawHeader: columnAliases.rawHeader, canonicalField: columnAliases.canonicalField })
    .from(columnAliases);
  return Object.fromEntries(rows.map((r) => [r.rawHeader, r.canonicalField]));
}

// Reads the import's uploaded file and proposes a column mapping by
// delegating to worker/preview.py, which itself delegates to
// worker/mapping.py — the single source of truth for header recognition,
// shared with the eventual import job (019/020), never reimplemented here.
// Returns null when the import id doesn't exist; throws
// UnsupportedFileTypeError (route -> 415) if the file itself couldn't be
// read, or a plain Error (unexpected, caught centrally -> 500) for a truly
// broken invocation.
export async function previewImport(db: Db, importId: number): Promise<ImportPreviewResult | null> {
  const [row] = await db
    .select({ filePath: imports.filePath })
    .from(imports)
    .where(eq(imports.id, importId))
    .limit(1);
  if (!row) return null;

  const learnedAliases = await getLearnedAliases(db);
  const stdout = await runPythonScript(PYTHON_BIN, PREVIEW_SCRIPT, [
    '--file-path',
    row.filePath,
    '--learned-aliases',
    JSON.stringify(learnedAliases),
  ]);

  const output = JSON.parse(stdout.trim()) as PythonPreviewSuccess | PythonPreviewFailure;
  if (!output.ok) {
    if (output.code === 'UNREADABLE_FILE') {
      throw new UnsupportedFileTypeError(output.reason);
    }
    // VALIDATION_ERROR here means the CLI invocation itself was malformed
    // (e.g. bad --learned-aliases JSON) — a genuine bug, not a user-facing
    // file problem, so it stays an unexpected error (500 INTERNAL).
    throw new Error(`Mapping preview failed for import ${String(importId)}: ${output.reason}`);
  }

  return { columns: output.columns, missingRequired: output.missingRequired };
}
