import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { I18nProvider } from '@/components/I18nProvider';
import { ApiClientError } from '@/lib/api';
import ImportDetailPage from '../page';
import type { ImportStatusResult } from 'shared';

expect.extend(toHaveNoViolations);

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useParams: () => ({ lang: 'fr', importId: '42' }),
  useRouter: () => ({ push: mockPush }),
}));

const mockTrackPublish =
  jest.fn<unknown, [{ examType: string | null; examYear: number; attemptCount: number }]>();
jest.mock('@/lib/analytics', () => ({
  trackPublish: (props: { examType: string | null; examYear: number; attemptCount: number }) =>
    mockTrackPublish(props),
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

const COMPLETED_UNPUBLISHED_PASSED: ImportStatusResult = {
  originalFilename: 'bac_2024.xlsx',
  status: 'completed',
  examType: 'bac',
  examYear: 2024,
  progress: 100,
  summary: { inserted: 4980, rejected: 20, duplicatesSkipped: 0 },
  smokePassed: true,
  published: false,
  failureReason: null,
};

function renderPage() {
  return render(
    <I18nProvider locale="fr">
      <ImportDetailPage />
    </I18nProvider>,
  );
}

beforeEach(() => {
  mockApiRequest.mockReset();
  mockTrackPublish.mockClear();
  mockPush.mockClear();
  // jsdom doesn't implement fetch; the page also fires a same-origin,
  // best-effort call to the Next.js revalidate-published-years route
  // handler after a successful publish/unpublish (see page.tsx), which
  // isn't the mocked `apiRequest` and needs its own stub here.
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
});

describe('Admin import detail / publish page', () => {
  it('renders the status, summary, and smoke result once loaded', async () => {
    mockApiRequest.mockResolvedValue(COMPLETED_UNPUBLISHED_PASSED);
    renderPage();

    expect(await screen.findByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
    expect(mockApiRequest).toHaveBeenCalledWith(
      '/api/imports/42/status',
      expect.anything(),
    );
  });

  it('links to the rows page once the import has produced a summary', async () => {
    mockApiRequest.mockResolvedValue(COMPLETED_UNPUBLISHED_PASSED);
    renderPage();

    const link = await screen.findByRole('link', { name: /Browse rows/ });
    expect(link).toHaveAttribute('href', '/admin/fr/imports/42/rows');
  });

  it('does not link to the rows page before the import has a summary', async () => {
    mockApiRequest.mockResolvedValue({
      originalFilename: 'bac_2024.xlsx',
      status: 'processing',
      examType: 'bac',
      examYear: 2024,
      progress: 40,
      summary: null,
      smokePassed: null,
      published: false,
      failureReason: null,
    });
    renderPage();

    await screen.findByText('Processing');
    expect(screen.queryByRole('link', { name: /Browse rows/ })).not.toBeInTheDocument();
  });

  it('is axe-clean once loaded', async () => {
    mockApiRequest.mockResolvedValue(COMPLETED_UNPUBLISHED_PASSED);
    const { container } = renderPage();
    await screen.findByText('Completed');

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('shows a not-found state for an unknown import', async () => {
    mockApiRequest.mockRejectedValue(
      new ApiClientError('IMPORT_NOT_FOUND', 'not found'),
    );
    renderPage();

    expect(
      await screen.findByText('This import could not be found.'),
    ).toBeInTheDocument();
  });

  it('enables Publish when the smoke check passed, and calls the publish endpoint', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockImplementation((path: string) => {
      if (path.endsWith('/publish'))
        return Promise.resolve({ published: true });
      return Promise.resolve(COMPLETED_UNPUBLISHED_PASSED);
    });
    renderPage();

    const publishButton = await screen.findByRole('button', {
      name: 'Publish',
    });
    expect(publishButton).toBeEnabled();

    await user.click(publishButton);

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/imports/42/publish',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    // Publishing flips local state to reflect success without a full reload.
    expect(
      await screen.findByRole('button', { name: 'Unpublish' }),
    ).toBeInTheDocument();
    // exam_year + attempt_count (rows published) — never any row's content.
    expect(mockTrackPublish).toHaveBeenCalledWith({ examType: 'bac', examYear: 2024, attemptCount: 4980 });
  });

  it('disables Publish and shows a note when the smoke check has not passed', async () => {
    mockApiRequest.mockResolvedValue({
      ...COMPLETED_UNPUBLISHED_PASSED,
      smokePassed: false,
    });
    renderPage();

    const publishButton = await screen.findByRole('button', {
      name: 'Publish',
    });
    expect(publishButton).toBeDisabled();
    expect(
      screen.getByText('Publishing is blocked until the smoke check passes.'),
    ).toBeInTheDocument();
  });

  it('shows Unpublish (not Publish) once the year is already published', async () => {
    mockApiRequest.mockImplementation((path: string) => {
      if (path.endsWith('/unpublish'))
        return Promise.resolve({ published: false });
      return Promise.resolve({
        ...COMPLETED_UNPUBLISHED_PASSED,
        published: true,
      });
    });
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Unpublish' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Publish' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Unpublish' }));

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/imports/42/unpublish',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(
      await screen.findByRole('button', { name: 'Publish' }),
    ).toBeInTheDocument();
    // Only the agreed 'publish' event is tracked — unpublish is an admin
    // reversal, not part of the analytics plan's event set.
    expect(mockTrackPublish).not.toHaveBeenCalled();
  });

  it('shows no publish controls before the import has completed', async () => {
    mockApiRequest.mockResolvedValue({
      originalFilename: 'bac_2024.xlsx',
      status: 'processing',
      examType: 'bac',
      examYear: 2024,
      progress: 40,
      summary: null,
      smokePassed: null,
      published: false,
      failureReason: null,
    });
    renderPage();

    await screen.findByText('Processing');
    expect(
      screen.queryByRole('button', { name: 'Publish' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Unpublish' }),
    ).not.toBeInTheDocument();
  });

  it('shows a cancel button instead of a delete button while the import is processing', async () => {
    mockApiRequest.mockResolvedValue({
      originalFilename: 'bac_2024.xlsx',
      status: 'processing',
      examType: 'bac',
      examYear: 2024,
      progress: 40,
      summary: null,
      smokePassed: null,
      published: false,
      failureReason: null,
    });
    renderPage();

    await screen.findByText('Processing');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Delete/i }),
    ).not.toBeInTheDocument();
  });

  it('shows a cancelling note instead of any action while the import is cancelling', async () => {
    mockApiRequest.mockResolvedValue({
      originalFilename: 'bac_2024.xlsx',
      status: 'cancelling',
      examType: 'bac',
      examYear: 2024,
      progress: null,
      summary: null,
      smokePassed: null,
      published: false,
      failureReason: null,
    });
    renderPage();

    expect(await screen.findByText('Cancelling')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Cancelling — stopping the running job and rolling back any partial data.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/i })).not.toBeInTheDocument();
  });

  it('opens the cancel confirmation dialog and updates status in place on confirm', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'POST' && path.endsWith('/cancel'))
        return Promise.resolve({ status: 'cancelling' });
      return Promise.resolve({
        originalFilename: 'bac_2024.xlsx',
        status: 'processing',
        examType: 'bac',
        examYear: 2024,
        progress: 40,
        summary: null,
        smokePassed: null,
        published: false,
        failureReason: null,
      });
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel import' }));

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/imports/42/cancel',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(await screen.findByText('Cancelling')).toBeInTheDocument();
  });

  it('opens the delete confirmation dialog, requires typing the exact filename, and deletes on confirm', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'DELETE') return Promise.resolve({ deletedAttempts: 4980 });
      return Promise.resolve(COMPLETED_UNPUBLISHED_PASSED);
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    const dialog = screen.getByRole('alertdialog');
    expect(
      within(dialog).getAllByText(/bac_2024\.xlsx/).length,
    ).toBeGreaterThan(0);

    const deleteButton = within(dialog).getByRole('button', {
      name: 'Delete import',
    });
    expect(deleteButton).toBeDisabled();

    const input = within(dialog).getByLabelText(/Type bac_2024\.xlsx to confirm/);
    await user.type(input, 'bac_2024.xlsx');
    expect(deleteButton).toBeEnabled();

    await user.click(deleteButton);

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/imports/42',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/admin/fr/imports');
    });
  });

  it('shows an inline error and keeps the dialog open when delete fails', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'DELETE')
        return Promise.reject(new ApiClientError('INTERNAL', 'boom'));
      return Promise.resolve(COMPLETED_UNPUBLISHED_PASSED);
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog');
    const input = within(dialog).getByLabelText(/Type bac_2024\.xlsx to confirm/);
    await user.type(input, 'bac_2024.xlsx');
    await user.click(within(dialog).getByRole('button', { name: 'Delete import' }));

    expect(await within(dialog).findByText('boom')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
