import { render, screen, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { I18nProvider } from '@/components/I18nProvider';
import { ApiClientError } from '@/lib/api';
import ImportsPage from '../page';
import type { ImportListItem } from 'shared';

expect.extend(toHaveNoViolations);

jest.mock('next/navigation', () => ({
  useParams: () => ({ lang: 'fr' }),
}));

const mockTrackUploadCompleted = jest.fn<
  unknown,
  [{ rowCount: number; rejected: number; durationMs: number }]
>();
jest.mock('@/lib/analytics', () => ({
  trackUploadCompleted: (props: { rowCount: number; rejected: number; durationMs: number }) =>
    mockTrackUploadCompleted(props),
}));

const mockApiRequest = jest.fn<Promise<unknown>, [string, RequestInit?]>();

jest.mock('@/lib/api', () => {
  class MockApiClientError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'ApiClientError';
    }
  }
  return {
    apiRequest: (path: string, options?: RequestInit) =>
      mockApiRequest(path, options),
    ApiClientError: MockApiClientError,
  };
});

function renderPage() {
  return render(
    <I18nProvider locale="fr">
      <ImportsPage />
    </I18nProvider>,
  );
}

const PENDING: ImportListItem = {
  id: 4,
  originalFilename: 'bac_2025_raw.xlsx',
  examYear: null,
  status: 'pending',
  progress: null,
  summary: null,
  smokePassed: null,
  published: false,
  failureReason: null,
  createdAt: '2026-07-04T09:00:00.000Z',
};

const PROCESSING: ImportListItem = {
  id: 3,
  originalFilename: 'bac_2024.xlsx',
  examYear: 2024,
  status: 'processing',
  progress: 40,
  summary: null,
  smokePassed: null,
  published: false,
  failureReason: null,
  createdAt: '2026-07-03T09:00:00.000Z',
};

const COMPLETED: ImportListItem = {
  id: 2,
  originalFilename: 'bac_2023.xlsx',
  examYear: 2023,
  status: 'completed',
  progress: 100,
  summary: { inserted: 4980, rejected: 20, duplicatesSkipped: 0 },
  smokePassed: true,
  published: true,
  failureReason: null,
  createdAt: '2026-06-01T09:00:00.000Z',
};

const FAILED: ImportListItem = {
  id: 1,
  originalFilename: 'bac_2021_bad.xlsx',
  examYear: null,
  status: 'failed',
  progress: null,
  summary: null,
  smokePassed: null,
  published: false,
  failureReason: 'MISSING_REQUIRED_COLUMNS',
  createdAt: '2025-09-10T09:00:00.000Z',
};

beforeEach(() => {
  mockApiRequest.mockReset();
  mockTrackUploadCompleted.mockClear();
});

describe('Admin imports dashboard', () => {
  it('renders every lifecycle state from the real API shape', async () => {
    mockApiRequest.mockResolvedValue([PENDING, PROCESSING, COMPLETED, FAILED]);
    renderPage();

    expect(await screen.findByText('bac_2025_raw.xlsx')).toBeInTheDocument();
    expect(screen.getByText('bac_2024.xlsx')).toBeInTheDocument();
    expect(screen.getByText('bac_2023.xlsx')).toBeInTheDocument();
    expect(screen.getByText('bac_2021_bad.xlsx')).toBeInTheDocument();

    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0);

    // Processing row shows a live progress bar.
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '40',
    );
    // Failed row surfaces its reason inline.
    expect(screen.getByText('MISSING_REQUIRED_COLUMNS')).toBeInTheDocument();
    // Completed + published row.
    expect(screen.getByText('Passed')).toBeInTheDocument();
    expect(mockApiRequest).toHaveBeenCalledWith(
      '/api/imports',
      expect.anything(),
    );
  });

  it('is axe-clean once loaded', async () => {
    mockApiRequest.mockResolvedValue([PENDING, PROCESSING, COMPLETED, FAILED]);
    const { container } = renderPage();
    await screen.findByText('bac_2025_raw.xlsx');

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('shows the honest empty state with an upload entry point', async () => {
    mockApiRequest.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No imports yet')).toBeInTheDocument();
    // Both the header CTA and the empty-state CTA point to the upload flow.
    const uploadLinks = screen.getAllByRole('link', { name: /New import/i });
    expect(uploadLinks.length).toBeGreaterThanOrEqual(1);
    for (const link of uploadLinks) {
      expect(link).toHaveAttribute('href', '/admin/fr/imports/upload');
    }
  });

  it('shows a loading state before the list resolves', () => {
    mockApiRequest.mockImplementation(() => new Promise(() => {}));
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Loading imports…');
  });

  it('shows a retryable error state on failure', async () => {
    mockApiRequest.mockRejectedValue(new ApiClientError('INTERNAL', 'boom'));
    renderPage();

    expect(
      await screen.findByText('Could not load imports. Please try again.'),
    ).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Réessayer' });

    mockApiRequest.mockResolvedValueOnce([COMPLETED]);
    await userEvent.click(retry);
    expect(await screen.findByText('bac_2023.xlsx')).toBeInTheDocument();
  });

  it('shows the reject-report download link for an import with a summary', async () => {
    mockApiRequest.mockResolvedValue([COMPLETED]);
    renderPage();

    const downloadLink = await screen.findByRole('link', { name: /Rejects/i });
    expect(downloadLink).toHaveAttribute(
      'href',
      expect.stringContaining('/api/imports/2/rejects'),
    );
    expect(downloadLink).toHaveAttribute('download');
  });

  it('does not offer a rejects download before an import has produced a summary', async () => {
    mockApiRequest.mockResolvedValue([PENDING, PROCESSING]);
    renderPage();

    await screen.findByText('bac_2025_raw.xlsx');
    expect(
      screen.queryByRole('link', { name: /Rejects/i }),
    ).not.toBeInTheDocument();
  });

  it('links a pending import to the mapping page, and other statuses to the detail page', async () => {
    mockApiRequest.mockResolvedValue([PENDING, COMPLETED]);
    renderPage();

    await screen.findByText('bac_2025_raw.xlsx');
    expect(screen.getByRole('link', { name: /Mapping/i })).toHaveAttribute(
      'href',
      '/admin/fr/imports/4/mapping',
    );
    expect(screen.getByRole('link', { name: /Details/i })).toHaveAttribute(
      'href',
      '/admin/fr/imports/2',
    );
  });

  it('polls and reflects live progress while an import is processing', async () => {
    jest.useFakeTimers();
    try {
      mockApiRequest
        .mockResolvedValueOnce([PROCESSING])
        .mockResolvedValueOnce([{ ...PROCESSING, progress: 90 }]);
      renderPage();

      expect(await screen.findByText('40%')).toBeInTheDocument();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(3000);
      });

      await waitFor(() => {
        expect(screen.getByText('90%')).toBeInTheDocument();
      });
      expect(mockApiRequest).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('tracks upload_completed exactly once, with row/rejected counts and an observed duration, when a processing import transitions to completed', async () => {
    jest.useFakeTimers();
    try {
      mockApiRequest
        .mockResolvedValueOnce([PROCESSING])
        .mockResolvedValueOnce([
          {
            ...PROCESSING,
            status: 'completed',
            progress: 100,
            summary: { inserted: 4980, rejected: 20, duplicatesSkipped: 5 },
          },
        ]);
      renderPage();

      await screen.findByText('40%');
      expect(mockTrackUploadCompleted).not.toHaveBeenCalled();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(3000);
      });

      await waitFor(() => {
        expect(mockTrackUploadCompleted).toHaveBeenCalledTimes(1);
      });
      expect(mockTrackUploadCompleted).toHaveBeenCalledWith({
        rowCount: 5005,
        rejected: 20,
        durationMs: 3000,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('never tracks upload_completed for an import that was already completed on first load', async () => {
    mockApiRequest.mockResolvedValue([COMPLETED]);
    renderPage();

    await screen.findByText('bac_2023.xlsx');
    expect(mockTrackUploadCompleted).not.toHaveBeenCalled();
  });

  it('offers a delete action for every status except processing', async () => {
    mockApiRequest.mockResolvedValue([PENDING, PROCESSING, COMPLETED, FAILED]);
    renderPage();

    await screen.findByText('bac_2025_raw.xlsx');
    expect(
      screen.getByRole('button', { name: /Delete bac_2025_raw\.xlsx/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Delete bac_2023\.xlsx/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Delete bac_2021_bad\.xlsx/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Delete bac_2024\.xlsx/ }),
    ).not.toBeInTheDocument();
  });

  it('opens the delete dialog for a row, confirms via the exact filename, and removes it from the list on success', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'DELETE') return Promise.resolve({ deletedAttempts: 4980 });
      return Promise.resolve([COMPLETED, FAILED]);
    });
    renderPage();

    await screen.findByText('bac_2023.xlsx');
    await user.click(screen.getByRole('button', { name: /Delete bac_2023\.xlsx/ }));

    const dialog = screen.getByRole('alertdialog');
    const input = within(dialog).getByLabelText(/Type bac_2023\.xlsx to confirm/);
    await user.type(input, 'bac_2023.xlsx');
    await user.click(within(dialog).getByRole('button', { name: 'Delete import' }));

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/imports/2',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByText('bac_2023.xlsx')).not.toBeInTheDocument();
    });
    expect(screen.getByText('bac_2021_bad.xlsx')).toBeInTheDocument();
  });

  it('keeps a row in the list and shows an inline error when delete fails', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'DELETE')
        return Promise.reject(new ApiClientError('IMPORT_PROCESSING', 'still running'));
      return Promise.resolve([COMPLETED]);
    });
    renderPage();

    await screen.findByText('bac_2023.xlsx');
    await user.click(screen.getByRole('button', { name: /Delete bac_2023\.xlsx/ }));
    const dialog = screen.getByRole('alertdialog');
    const input = within(dialog).getByLabelText(/Type bac_2023\.xlsx to confirm/);
    await user.type(input, 'bac_2023.xlsx');
    await user.click(within(dialog).getByRole('button', { name: 'Delete import' }));

    expect(await within(dialog).findByText('still running')).toBeInTheDocument();
    expect(screen.getByText('bac_2023.xlsx')).toBeInTheDocument();
  });
});
