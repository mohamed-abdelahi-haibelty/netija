import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import { imports as importsTable } from '../db/schema.js';

vi.mock('../lib/pythonRunner.js', () => ({ runPythonScript: vi.fn() }));
vi.mock('../services/smokeVerification.js', () => ({ runSmokeVerification: vi.fn() }));
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));

import { runPythonScript } from '../lib/pythonRunner.js';
import { runSmokeVerification } from '../services/smokeVerification.js';
import { runImportJob, markImportFailed, ImportCancelledError } from '../services/importJob.js';
import * as Sentry from '@sentry/node';

const mockRunPythonScript = vi.mocked(runPythonScript);
const mockRunSmokeVerification = vi.mocked(runSmokeVerification);
const mockCaptureException = vi.mocked(Sentry.captureException);

beforeEach(() => {
  vi.clearAllMocks();
  mockRunSmokeVerification.mockResolvedValue({ passed: true, reason: null });
});

// A fake standing in for the imports table's Drizzle chain — records every
// `set()` payload (see testing.md: "status transitions including the
// failure path") and mirrors two real behaviors this module now depends on:
// the conditional claim UPDATE ... WHERE ... RETURNING (task 032, mirrors
// confirm.ts's own claim pattern) and a `select` used to read back the
// current status after a crash.
function makeFakeDb(opts: { claims?: boolean; statusOnSelect?: string } = {}) {
  const claims = opts.claims ?? true;
  const statusOnSelect = opts.statusOnSelect ?? 'processing';
  const updates: Array<Record<string, unknown>> = [];
  const db = {
    update: (table: unknown) => {
      if (table !== importsTable) throw new Error('unexpected table in update');
      return {
        set: (values: Record<string, unknown>) => {
          updates.push(values);
          return {
            where: () =>
              Object.assign(Promise.resolve(), {
                returning: () => Promise.resolve(claims ? [{ id: 42 }] : []),
              }),
          };
        },
      };
    },
    select: () => ({
      from: (table: unknown) => {
        if (table !== importsTable) throw new Error('unexpected table in select');
        return { where: () => ({ limit: () => Promise.resolve([{ status: statusOnSelect }]) }) };
      },
    }),
  };
  return { db, updates };
}

describe('runImportJob', () => {
  it('marks the import processing, then completed with the summary on success', async () => {
    mockRunPythonScript.mockResolvedValue(
      JSON.stringify({ ok: true, inserted: 100, rejected: 3, duplicates_skipped: 2 }),
    );
    const { db, updates } = makeFakeDb();

    await runImportJob(db as never, { importId: 42, examType: 'bac', examYear: 2024, mapping: { NODOSS: 'exam_no' } });

    // [0] the initial claim, [1] clearing workerPid once the process
    // exits, [2] progress: 100 (status/summary are now written by
    // loader.py itself, inside the same transaction as the data — task
    // 032's loader-atomicity fix), [3] the smoke result.
    expect(updates).toHaveLength(4);
    expect(updates[0]).toMatchObject({ status: 'processing', progress: 0 });
    expect(updates[1]).toMatchObject({ workerPid: null });
    expect(updates[2]).toMatchObject({ progress: 100 });
    expect(updates[3]).toMatchObject({ smokePassed: true });
    expect(mockRunSmokeVerification).toHaveBeenCalledWith(db, 42);
  });

  it('records smokePassed: false when the smoke check fails', async () => {
    mockRunPythonScript.mockResolvedValue(
      JSON.stringify({ ok: true, inserted: 100, rejected: 3, duplicates_skipped: 2 }),
    );
    mockRunSmokeVerification.mockResolvedValue({ passed: false, reason: 'mismatch' });
    const { db, updates } = makeFakeDb();

    await runImportJob(db as never, { importId: 42, examType: 'bac', examYear: 2024, mapping: { NODOSS: 'exam_no' } });

    expect(updates[3]).toMatchObject({ smokePassed: false });
  });

  it('records smokePassed: false (fail closed) when the smoke check itself throws', async () => {
    mockRunPythonScript.mockResolvedValue(
      JSON.stringify({ ok: true, inserted: 100, rejected: 3, duplicates_skipped: 2 }),
    );
    mockRunSmokeVerification.mockRejectedValue(new Error('db exploded'));
    const { db, updates } = makeFakeDb();

    await runImportJob(db as never, { importId: 42, examType: 'bac', examYear: 2024, mapping: { NODOSS: 'exam_no' } });

    expect(updates[3]).toMatchObject({ smokePassed: false });
  });

  it('reports an unexpected smoke-verification throw to Sentry with importId/stage context, never row content', async () => {
    mockRunPythonScript.mockResolvedValue(
      JSON.stringify({ ok: true, inserted: 100, rejected: 3, duplicates_skipped: 2 }),
    );
    const thrown = new Error('db exploded');
    mockRunSmokeVerification.mockRejectedValue(thrown);
    const { db } = makeFakeDb();

    await runImportJob(db as never, { importId: 42, examType: 'bac', examYear: 2024, mapping: { NODOSS: 'exam_no' } });

    expect(mockCaptureException).toHaveBeenCalledWith(thrown, {
      extra: { importId: 42, stage: 'smoke-verification' },
    });
  });

  it('spawns worker.py with the job arguments as an argv array', async () => {
    mockRunPythonScript.mockResolvedValue(
      JSON.stringify({ ok: true, inserted: 0, rejected: 0, duplicates_skipped: 0 }),
    );
    const { db } = makeFakeDb();

    await runImportJob(db as never, {
      importId: 7,
      examType: 'brevet',
      examYear: 2023,
      mapping: { NODOSS: 'exam_no', NOMPL: 'name_fr' },
    });

    expect(mockRunPythonScript).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/worker\.py$/),
      [
        '--file-id',
        '7',
        '--exam-type',
        'brevet',
        '--exam-year',
        '2023',
        '--mapping',
        JSON.stringify({ NODOSS: 'exam_no', NOMPL: 'name_fr' }),
      ],
      expect.any(Function),
    );
  });

  it('persists the spawned child pid via the onSpawn callback', async () => {
    mockRunPythonScript.mockImplementation((_bin, _script, _args, onSpawn) => {
      onSpawn?.(4321);
      return Promise.resolve(JSON.stringify({ ok: true, inserted: 0, rejected: 0, duplicates_skipped: 0 }));
    });
    const { db, updates } = makeFakeDb();

    await runImportJob(db as never, { importId: 42, examType: 'bac', examYear: 2024, mapping: {} });

    expect(updates.some((u) => u['workerPid'] === 4321)).toBe(true);
  });

  it('throws ImportJobError with the precise code/reason on an expected Python failure, without marking completed', async () => {
    mockRunPythonScript.mockResolvedValue(
      JSON.stringify({ ok: false, code: 'MISSING_REQUIRED_COLUMNS', reason: 'no exam_no column' }),
    );
    const { db, updates } = makeFakeDb();

    await expect(
      runImportJob(db as never, { importId: 42, examType: 'bac', examYear: 2024, mapping: {} }),
    ).rejects.toMatchObject({ code: 'MISSING_REQUIRED_COLUMNS', message: 'no exam_no column' });

    // The initial "processing" claim, then the workerPid clear — never a
    // completed/cancelled write.
    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({ status: 'processing' });
    expect(updates[1]).toMatchObject({ workerPid: null });
  });

  it('propagates a truly broken invocation (e.g. missing interpreter) as a plain rejection when not cancelling', async () => {
    mockRunPythonScript.mockRejectedValue(new Error('spawn python3 ENOENT'));
    const { db, updates } = makeFakeDb({ statusOnSelect: 'processing' });

    await expect(
      runImportJob(db as never, { importId: 42, examType: 'bac', examYear: 2024, mapping: {} }),
    ).rejects.not.toBeInstanceOf(ImportCancelledError);
    expect(updates).toHaveLength(2);
    expect(updates[1]).toMatchObject({ workerPid: null });
  });

  it('does not run at all when the import is already cancelling/cancelled (claim loses the race)', async () => {
    const { db, updates } = makeFakeDb({ claims: false });

    await runImportJob(db as never, { importId: 42, examType: 'bac', examYear: 2024, mapping: {} });

    expect(mockRunPythonScript).not.toHaveBeenCalled();
    expect(updates).toHaveLength(1);
  });

  it('finalizes a Python-reported CANCELLED outcome as cancelled and never retries it', async () => {
    mockRunPythonScript.mockResolvedValue(
      JSON.stringify({ ok: false, code: 'CANCELLED', reason: 'Import was cancelled by an admin.' }),
    );
    const { db, updates } = makeFakeDb();

    const err = await runImportJob(
      db as never,
      { importId: 42, examType: 'bac', examYear: 2024, mapping: {} },
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ImportCancelledError);
    expect(err).toBeInstanceOf(UnrecoverableError);
    expect(updates.at(-1)).toMatchObject({ status: 'cancelled', progress: null, failureReason: null });
    expect(mockRunSmokeVerification).not.toHaveBeenCalled();
  });

  it('finalizes as cancelled (not a crash) when the process is killed after a cancel request was already flagged', async () => {
    mockRunPythonScript.mockRejectedValue(new Error('python3 ... was killed with SIGKILL'));
    const { db, updates } = makeFakeDb({ statusOnSelect: 'cancelling' });

    const err = await runImportJob(
      db as never,
      { importId: 42, examType: 'bac', examYear: 2024, mapping: {} },
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ImportCancelledError);
    expect(updates.at(-1)).toMatchObject({ status: 'cancelled', progress: null, failureReason: null });
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
