import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/studentPage.js', () => ({ getAdminResultPreview: vi.fn() }));

import { getAdminResultPreview } from '../services/studentPage.js';
import { runSmokeVerification } from '../services/smokeVerification.js';
import type { StudentResult } from 'shared';

const mockGetAdminResultPreview = vi.mocked(getAdminResultPreview);

beforeEach(() => {
  vi.clearAllMocks();
});

// A minimal fake standing in for the Drizzle chain smokeVerification.ts uses.
// Dispatches by call order: 1) the imports row, 2) attempts count,
// 3) rejects count, 4) the random sample.
function makeFakeDb(opts: {
  importRow?: { summaryInserted: number | null; summaryRejected: number | null };
  insertedCount: number;
  rejectedCount: number;
  sample: Array<{
    slug: string;
    examYear: number;
    examNo: string;
    nameFr: string | null;
    nameAr: string | null;
    moyenne: string | null;
    decision: string;
  }>;
}) {
  let call = 0;
  return {
    select: () => {
      call += 1;
      const callIndex = call;
      return {
        from: () => ({
          where: () => {
            if (callIndex === 1) {
              return { limit: () => Promise.resolve(opts.importRow ? [opts.importRow] : []) };
            }
            if (callIndex === 2) {
              return Promise.resolve([{ count: String(opts.insertedCount) }]);
            }
            if (callIndex === 3) {
              return Promise.resolve([{ count: String(opts.rejectedCount) }]);
            }
            return { orderBy: () => ({ limit: () => Promise.resolve(opts.sample) }) };
          },
        }),
      };
    },
  };
}

const SAMPLE_ROW: {
  slug: string;
  examYear: number;
  examNo: string;
  nameFr: string | null;
  nameAr: string | null;
  moyenne: string | null;
  decision: StudentResult['decision'];
} = {
  slug: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
  examYear: 2024,
  examNo: '00042',
  nameFr: 'Ahmed Ould Mohamed',
  nameAr: null,
  moyenne: '14.50',
  decision: 'Admis',
};

function previewFrom(row: typeof SAMPLE_ROW): StudentResult {
  return {
    slug: row.slug,
    examType: 'bac',
    examYear: row.examYear,
    examNo: row.examNo,
    nameFr: row.nameFr,
    nameAr: row.nameAr,
    serie: 'SN',
    moyenne: row.moyenne,
    decision: row.decision,
    decisionRaw: row.decision,
  };
}

describe('runSmokeVerification', () => {
  it('returns not-found when the import does not exist', async () => {
    const db = makeFakeDb({ importRow: undefined, insertedCount: 0, rejectedCount: 0, sample: [] });

    const result = await runSmokeVerification(db as never, 999);

    expect(result).toEqual({ passed: false, reason: 'Import not found.' });
  });

  it('passes when counts reconcile and every sampled attempt round-trips through the admin preview', async () => {
    const db = makeFakeDb({
      importRow: { summaryInserted: 1, summaryRejected: 0 },
      insertedCount: 1,
      rejectedCount: 0,
      sample: [SAMPLE_ROW],
    });
    mockGetAdminResultPreview.mockResolvedValue(previewFrom(SAMPLE_ROW));

    const result = await runSmokeVerification(db as never, 42);

    expect(result).toEqual({ passed: true, reason: null });
  });

  it('fails loudly on a reconciliation mismatch (inserted count disagrees with Postgres)', async () => {
    const db = makeFakeDb({
      importRow: { summaryInserted: 5, summaryRejected: 0 },
      insertedCount: 4, // deliberately wrong: summary claims 5, DB actually has 4
      rejectedCount: 0,
      sample: [],
    });

    const result = await runSmokeVerification(db as never, 42);

    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/Inserted count mismatch/);
    expect(mockGetAdminResultPreview).not.toHaveBeenCalled();
  });

  it('fails loudly on a reconciliation mismatch (rejected count disagrees with Postgres)', async () => {
    const db = makeFakeDb({
      importRow: { summaryInserted: 1, summaryRejected: 2 },
      insertedCount: 1,
      rejectedCount: 3, // deliberately wrong
      sample: [],
    });

    const result = await runSmokeVerification(db as never, 42);

    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/Rejected count mismatch/);
  });

  it('fails loudly when a sampled attempt does not match its admin preview (deliberate mismatch)', async () => {
    const db = makeFakeDb({
      importRow: { summaryInserted: 1, summaryRejected: 0 },
      insertedCount: 1,
      rejectedCount: 0,
      sample: [SAMPLE_ROW],
    });
    // The admin preview returns a DIFFERENT decision than what's actually
    // stored — proving the sample check catches a wrong-data bug, not just a
    // missing row.
    mockGetAdminResultPreview.mockResolvedValue({
      ...previewFrom(SAMPLE_ROW),
      decision: 'Ajourné',
    });

    const result = await runSmokeVerification(db as never, 42);

    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/Admin preview mismatch/);
  });

  it('fails loudly when a sampled attempt is missing from the admin preview entirely', async () => {
    const db = makeFakeDb({
      importRow: { summaryInserted: 1, summaryRejected: 0 },
      insertedCount: 1,
      rejectedCount: 0,
      sample: [SAMPLE_ROW],
    });
    mockGetAdminResultPreview.mockResolvedValue(null);

    const result = await runSmokeVerification(db as never, 42);

    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/Admin preview mismatch/);
  });

  it('passes with zero rows sampled when the import inserted nothing (all rejected)', async () => {
    const db = makeFakeDb({
      importRow: { summaryInserted: 0, summaryRejected: 5 },
      insertedCount: 0,
      rejectedCount: 5,
      sample: [],
    });

    const result = await runSmokeVerification(db as never, 42);

    expect(result).toEqual({ passed: true, reason: null });
    expect(mockGetAdminResultPreview).not.toHaveBeenCalled();
  });
});
