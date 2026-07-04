import { describe, it, expect, vi, beforeEach } from 'vitest';
import { imports as importsTable } from '../db/schema.js';

vi.mock('../lib/pythonRunner.js', () => ({ runPythonScript: vi.fn() }));
vi.mock('../services/smokeVerification.js', () => ({ runSmokeVerification: vi.fn() }));

import { runPythonScript } from '../lib/pythonRunner.js';
import { runSmokeVerification } from '../services/smokeVerification.js';
import { runImportJob, markImportFailed, ImportJobError } from '../services/importJob.js';

const mockRunPythonScript = vi.mocked(runPythonScript);
const mockRunSmokeVerification = vi.mocked(runSmokeVerification);

beforeEach(() => {
  vi.clearAllMocks();
  mockRunSmokeVerification.mockResolvedValue({ passed: true, reason: null });
});

// A minimal fake standing in for the imports table's Drizzle chain — records
// every `set()` payload so tests can assert the exact status transitions
// (see testing.md: "status transitions including the failure path").
function makeFakeDb() {
  const updates: Array<Record<string, unknown>> = [];
  const db = {
    update: (table: unknown) => {
      if (table !== importsTable) throw new Error('unexpected table in update');
      return {
        set: (values: Record<string, unknown>) => {
          updates.push(values);
          return { where: () => Promise.resolve() };
        },
      };
    },
  };
  return { db, updates };
}

describe('runImportJob', () => {
  it('marks the import processing, then completed with the summary on success', async () => {
    mockRunPythonScript.mockResolvedValue(
      JSON.stringify({ ok: true, inserted: 100, rejected: 3, duplicates_skipped: 2 }),
    );
    const { db, updates } = makeFakeDb();

    await runImportJob(db as never, { importId: 42, examYear: 2024, mapping: { NODOSS: 'exam_no' } });

    expect(updates).toHaveLength(3);
    expect(updates[0]).toMatchObject({ status: 'processing', progress: 0 });
    expect(updates[1]).toMatchObject({
      status: 'completed',
      progress: 100,
      summaryInserted: 100,
      summaryRejected: 3,
      summaryDuplicatesSkipped: 2,
      failureReason: null,
    });
    expect(updates[2]).toMatchObject({ smokePassed: true });
    expect(mockRunSmokeVerification).toHaveBeenCalledWith(db, 42);
  });

  it('records smokePassed: false when the smoke check fails', async () => {
    mockRunPythonScript.mockResolvedValue(
      JSON.stringify({ ok: true, inserted: 100, rejected: 3, duplicates_skipped: 2 }),
    );
    mockRunSmokeVerification.mockResolvedValue({ passed: false, reason: 'mismatch' });
    const { db, updates } = makeFakeDb();

    await runImportJob(db as never, { importId: 42, examYear: 2024, mapping: { NODOSS: 'exam_no' } });

    expect(updates[2]).toMatchObject({ smokePassed: false });
  });

  it('records smokePassed: false (fail closed) when the smoke check itself throws', async () => {
    mockRunPythonScript.mockResolvedValue(
      JSON.stringify({ ok: true, inserted: 100, rejected: 3, duplicates_skipped: 2 }),
    );
    mockRunSmokeVerification.mockRejectedValue(new Error('db exploded'));
    const { db, updates } = makeFakeDb();

    await runImportJob(db as never, { importId: 42, examYear: 2024, mapping: { NODOSS: 'exam_no' } });

    expect(updates[2]).toMatchObject({ smokePassed: false });
  });

  it('spawns worker.py with the job arguments as an argv array', async () => {
    mockRunPythonScript.mockResolvedValue(
      JSON.stringify({ ok: true, inserted: 0, rejected: 0, duplicates_skipped: 0 }),
    );
    const { db } = makeFakeDb();

    await runImportJob(db as never, {
      importId: 7,
      examYear: 2023,
      mapping: { NODOSS: 'exam_no', NOMPL: 'name_fr' },
    });

    expect(mockRunPythonScript).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/worker\.py$/),
      ['--file-id', '7', '--exam-year', '2023', '--mapping', JSON.stringify({ NODOSS: 'exam_no', NOMPL: 'name_fr' })],
    );
  });

  it('throws ImportJobError with the precise code/reason on an expected Python failure, without marking completed', async () => {
    mockRunPythonScript.mockResolvedValue(
      JSON.stringify({ ok: false, code: 'MISSING_REQUIRED_COLUMNS', reason: 'no exam_no column' }),
    );
    const { db, updates } = makeFakeDb();

    await expect(
      runImportJob(db as never, { importId: 42, examYear: 2024, mapping: {} }),
    ).rejects.toMatchObject({ code: 'MISSING_REQUIRED_COLUMNS', message: 'no exam_no column' });

    // Only the initial "processing" transition happened — never "completed".
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ status: 'processing' });
  });

  it('propagates a truly broken invocation (e.g. missing interpreter) as a plain rejection', async () => {
    mockRunPythonScript.mockRejectedValue(new Error('spawn python3 ENOENT'));
    const { db, updates } = makeFakeDb();

    await expect(
      runImportJob(db as never, { importId: 42, examYear: 2024, mapping: {} }),
    ).rejects.not.toBeInstanceOf(ImportJobError);
    expect(updates).toHaveLength(1);
  });
});

describe('markImportFailed', () => {
  it('sets status failed with the given reason', async () => {
    const { db, updates } = makeFakeDb();

    await markImportFailed(db as never, 42, 'Import failed after 3 attempts.');

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ status: 'failed', failureReason: 'Import failed after 3 attempts.' });
  });
});
