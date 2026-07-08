import { mockApiModule as mockCreateApiModule } from '@/lib/testUtils/mockApi';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { I18nProvider } from '@/components/I18nProvider';
import { ApiClientError } from '@/lib/api';
import ImportRowsPage from '../page';
import type { ImportAttemptRow, ImportAttemptsListResult } from 'shared';

expect.extend(toHaveNoViolations);

jest.mock('next/navigation', () => ({
  useParams: () => ({ lang: 'fr', importId: '42' }),
}));

const mockApiRequest = jest.fn<Promise<unknown>, [string, RequestInit?]>();

jest.mock('@/lib/api', () => ({
  ...mockCreateApiModule(),
  apiRequest: (path: string, options?: RequestInit) => mockApiRequest(path, options),
}));

function renderPage() {
  return render(
    <I18nProvider locale="fr">
      <ImportRowsPage />
    </I18nProvider>,
  );
}

function lastRequestedUrl(): string {
  const call = mockApiRequest.mock.calls.at(-1);
  if (!call) throw new Error('apiRequest was never called');
  return call[0];
}

const ROWS: ImportAttemptRow[] = [
  { id: 1, examNo: '00001', nameFr: 'Ahmed Ould Sidi', nameAr: null, serie: 'SN', moyenne: '12.50', decision: 'Admis' },
  { id: 2, examNo: '00002', nameFr: 'Fatima Mint Cheikh', nameAr: null, serie: 'LM', moyenne: null, decision: 'Ajourné' },
];

const PAGE_1: ImportAttemptsListResult = {
  rows: ROWS,
  total: 2,
  page: 1,
  pageSize: 50,
  availableSeries: ['LM', 'SN'],
};

beforeEach(() => {
  mockApiRequest.mockReset();
});

describe('Admin import rows page', () => {
  it('loads and renders the first page of rows', async () => {
    mockApiRequest.mockResolvedValue(PAGE_1);
    renderPage();

    expect(await screen.findByText('00001')).toBeInTheDocument();
    expect(screen.getByText('Ahmed Ould Sidi')).toBeInTheDocument();
    expect(screen.getByText('00002')).toBeInTheDocument();
    expect(screen.getByText('2 rows')).toBeInTheDocument();
    expect(lastRequestedUrl()).toBe('/api/imports/42/attempts?page=1&pageSize=50');
  });

  it('is axe-clean once loaded', async () => {
    mockApiRequest.mockResolvedValue(PAGE_1);
    const { container } = renderPage();
    await screen.findByText('00001');

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('shows a not-found state for an unknown import', async () => {
    mockApiRequest.mockRejectedValue(new ApiClientError('IMPORT_NOT_FOUND', 'not found'));
    renderPage();

    expect(await screen.findByText('This import could not be found.')).toBeInTheDocument();
  });

  it('shows an empty state when no rows match', async () => {
    mockApiRequest.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 50, availableSeries: [] });
    renderPage();

    expect(await screen.findByText('No rows match your search')).toBeInTheDocument();
  });

  it('debounces search input, resets to page 1, and sends the search param', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue(PAGE_1);
    renderPage();
    await screen.findByText('00001');
    mockApiRequest.mockClear();

    await user.type(screen.getByLabelText('Search'), 'Ahmed');

    await waitFor(
      () => {
        expect(lastRequestedUrl()).toBe('/api/imports/42/attempts?page=1&pageSize=50&search=Ahmed');
      },
      { timeout: 2000 },
    );
  });

  it('sends the serie filter and resets to page 1', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue(PAGE_1);
    renderPage();
    await screen.findByText('00001');
    mockApiRequest.mockClear();

    await user.click(screen.getByRole('combobox', { name: 'Serie' }));
    await user.click(await screen.findByRole('option', { name: 'SN' }));

    await waitFor(() => {
      expect(lastRequestedUrl()).toBe('/api/imports/42/attempts?page=1&pageSize=50&serie=SN');
    });
  });

  it('sends the decision filter and resets to page 1', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue(PAGE_1);
    renderPage();
    await screen.findByText('00001');
    mockApiRequest.mockClear();

    await user.click(screen.getByRole('combobox', { name: 'Decision' }));
    await user.click(await screen.findByRole('option', { name: 'Admis' }));

    await waitFor(() => {
      expect(lastRequestedUrl()).toBe(
        '/api/imports/42/attempts?page=1&pageSize=50&decision=Admis',
      );
    });
  });

  it('paginates with Previous disabled on page 1 and Next requesting page 2', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue({ ...PAGE_1, total: 120 });
    renderPage();
    await screen.findByText('00001');

    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();

    mockApiRequest.mockClear();
    mockApiRequest.mockResolvedValue({ ...PAGE_1, page: 2, total: 120 });
    await user.click(screen.getByRole('button', { name: /Next/ }));

    await waitFor(() => {
      expect(lastRequestedUrl()).toBe('/api/imports/42/attempts?page=2&pageSize=50');
    });
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('selects a row, shows the bulk bar, and bulk-deletes the selected rows', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'DELETE') return Promise.resolve({ deletedAttempts: 1 });
      return Promise.resolve(PAGE_1);
    });
    renderPage();
    await screen.findByText('00001');

    await user.click(screen.getByRole('checkbox', { name: 'Select row 00001' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Delete selected/ }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: 'Delete row' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/imports/42/attempts',
        expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ attemptIds: [1] }) }),
      );
    });
    // The dialog closes and the page reloads once the delete succeeds.
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });

  it('selects all rows on the page via the header checkbox', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue(PAGE_1);
    renderPage();
    await screen.findByText('00001');

    await user.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select row 00001' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select row 00002' })).toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }));
    expect(screen.queryByText('2 selected')).not.toBeInTheDocument();
  });

  it('deletes a single row via its own row action', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'DELETE') return Promise.resolve({ deletedAttempts: 1 });
      return Promise.resolve(PAGE_1);
    });
    renderPage();
    await screen.findByText('00001');

    await user.click(screen.getByRole('button', { name: 'Delete 00002' }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/imports/42/attempts',
        expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ attemptIds: [2] }) }),
      );
    });
  });
});
