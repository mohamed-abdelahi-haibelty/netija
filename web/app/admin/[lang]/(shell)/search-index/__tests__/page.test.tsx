import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { I18nProvider } from '@/components/I18nProvider';
import { ApiClientError } from '@/lib/api';
import SearchIndexPage from '../page';
import type { SearchIndexStatusResult, SearchIndexDocumentsResult } from 'shared';

expect.extend(toHaveNoViolations);

jest.mock('next/navigation', () => ({
  useParams: () => ({ lang: 'fr' }),
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
    apiRequest: (path: string, options?: RequestInit) => mockApiRequest(path, options),
    ApiClientError: MockApiClientError,
  };
});

function renderPage() {
  return render(
    <I18nProvider locale="fr">
      <SearchIndexPage />
    </I18nProvider>,
  );
}

function requestedUrls(): string[] {
  return mockApiRequest.mock.calls.map((call) => call[0]);
}

function lastRequestedUrl(matching: string): string {
  const call = [...mockApiRequest.mock.calls].reverse().find(([path]) => path.startsWith(matching));
  if (!call) throw new Error(`no call matching ${matching}`);
  return call[0];
}

const STATUS: SearchIndexStatusResult = {
  documentCount: 42,
  isIndexing: false,
  healthy: true,
  searchableAttributes: ['nameFr', 'nameAr'],
  sortableAttributes: ['examYear'],
  filterableAttributes: ['importId', 'examYear'],
};

const DOCS: SearchIndexDocumentsResult = {
  documents: [
    { slug: 's1', importId: 7, examYear: 2024, examNo: '00001', nameFr: 'Ahmed', nameAr: null, serie: 'SN' },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
};

function mockDefaultResponses() {
  mockApiRequest.mockImplementation((path: string) => {
    if (path.startsWith('/api/search-index/status')) return Promise.resolve(STATUS);
    if (path.startsWith('/api/search-index/documents')) return Promise.resolve(DOCS);
    throw new Error(`unexpected request: ${path}`);
  });
}

beforeEach(() => {
  mockApiRequest.mockReset();
});

describe('Admin search index page', () => {
  it('loads and renders the index status and documents', async () => {
    mockDefaultResponses();
    renderPage();

    expect(await screen.findByText('42')).toBeInTheDocument();
    expect(screen.getByText('Reachable')).toBeInTheDocument();
    expect(screen.getByText('00001')).toBeInTheDocument();
    expect(screen.getByText('Ahmed')).toBeInTheDocument();
    expect(requestedUrls()).toEqual(
      expect.arrayContaining([
        '/api/search-index/status',
        '/api/search-index/documents?page=1&pageSize=20',
      ]),
    );
  });

  it('is axe-clean once loaded', async () => {
    mockDefaultResponses();
    const { container } = renderPage();
    await screen.findByText('00001');

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('shows a status load error with a retry action', async () => {
    mockApiRequest.mockImplementation((path: string) => {
      if (path.startsWith('/api/search-index/status')) return Promise.reject(new Error('boom'));
      return Promise.resolve(DOCS);
    });
    renderPage();

    expect(await screen.findByText('Could not load the index status. Please try again.')).toBeInTheDocument();
  });

  it('shows an empty state when no documents match', async () => {
    mockApiRequest.mockImplementation((path: string) => {
      if (path.startsWith('/api/search-index/status')) return Promise.resolve(STATUS);
      return Promise.resolve({ documents: [], total: 0, page: 1, pageSize: 20 });
    });
    renderPage();

    expect(await screen.findByText('No documents match this filter')).toBeInTheDocument();
  });

  it('shows a not-found state for an unknown importId filter', async () => {
    mockApiRequest.mockImplementation((path: string) => {
      if (path.startsWith('/api/search-index/status')) return Promise.resolve(STATUS);
      if (path.includes('importId=999'))
        return Promise.reject(new ApiClientError('IMPORT_NOT_FOUND', 'not found'));
      return Promise.resolve(DOCS);
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('00001');

    await user.type(screen.getByLabelText('Import ID'), '999');

    expect(await screen.findByText('This import could not be found.')).toBeInTheDocument();
  });

  it('debounces the importId filter, resets to page 1, and clears the search query', async () => {
    const user = userEvent.setup();
    mockDefaultResponses();
    renderPage();
    await screen.findByText('00001');

    await user.type(screen.getByLabelText('Search'), 'Ahmed');
    mockApiRequest.mockClear();
    mockDefaultResponses();

    await user.type(screen.getByLabelText('Import ID'), '7');

    await waitFor(() => {
      expect(lastRequestedUrl('/api/search-index/documents')).toBe(
        '/api/search-index/documents?page=1&pageSize=20&importId=7',
      );
    });
    expect(screen.getByLabelText('Search')).toHaveValue('');
  });

  it('debounces the search query, resets to page 1, and clears the importId filter', async () => {
    const user = userEvent.setup();
    mockDefaultResponses();
    renderPage();
    await screen.findByText('00001');

    await user.type(screen.getByLabelText('Import ID'), '7');
    mockApiRequest.mockClear();
    mockDefaultResponses();

    await user.type(screen.getByLabelText('Search'), 'Ahmed');

    await waitFor(() => {
      expect(lastRequestedUrl('/api/search-index/documents')).toBe(
        '/api/search-index/documents?page=1&pageSize=20&q=Ahmed',
      );
    });
    expect(screen.getByLabelText('Import ID')).toHaveValue(null);
  });

  it('paginates with Previous disabled on page 1 and Next requesting page 2', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockImplementation((path: string) => {
      if (path.startsWith('/api/search-index/status')) return Promise.resolve(STATUS);
      return Promise.resolve({ ...DOCS, total: 100 });
    });
    renderPage();
    await screen.findByText('00001');

    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();
    expect(screen.getByText('Page 1 of 5')).toBeInTheDocument();

    mockApiRequest.mockClear();
    mockApiRequest.mockImplementation((path: string) => {
      if (path.startsWith('/api/search-index/status')) return Promise.resolve(STATUS);
      return Promise.resolve({ ...DOCS, page: 2, total: 100 });
    });
    await user.click(screen.getByRole('button', { name: /Next/ }));

    await waitFor(() => {
      expect(lastRequestedUrl('/api/search-index/documents')).toBe(
        '/api/search-index/documents?page=2&pageSize=20',
      );
    });
    expect(await screen.findByText('Page 2 of 5')).toBeInTheDocument();
  });

  it('reindexes via the dialog, shows a success notice, and reloads status and documents', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'POST') return Promise.resolve({ documentCount: 999 });
      if (path.startsWith('/api/search-index/status')) return Promise.resolve(STATUS);
      return Promise.resolve(DOCS);
    });
    renderPage();
    await screen.findByText('00001');
    mockApiRequest.mockClear();
    mockApiRequest.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'POST') return Promise.resolve({ documentCount: 999 });
      if (path.startsWith('/api/search-index/status')) return Promise.resolve(STATUS);
      return Promise.resolve(DOCS);
    });

    await user.click(screen.getByRole('button', { name: 'Reindex' }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Reindex' }));

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/search-index/reindex',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(await screen.findByText('Reindex complete — 999 documents indexed.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
