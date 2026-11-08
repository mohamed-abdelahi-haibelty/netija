import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { TestI18nProvider as I18nProvider } from '@/lib/testUtils/i18n';
import { ApiClientError } from '@/lib/api';
import CachePage from '../page';
import type { CacheStatusResult, CacheKeysListResult, CacheKeyInspectResult } from 'shared';

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
      <CachePage />
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

const STATUS: CacheStatusResult = { examKeyCount: 2, resultKeyCount: 1, totalKeyCount: 3 };

const KEYS: CacheKeysListResult = {
  keys: [
    { key: 'exam:2024:00001', ttl: 120 },
    { key: 'result:abc123', ttl: 300 },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
};

function mockDefaultResponses() {
  mockApiRequest.mockImplementation((path: string) => {
    if (path.startsWith('/api/cache/status')) return Promise.resolve(STATUS);
    if (path.startsWith('/api/cache/keys/')) return Promise.reject(new Error('unexpected inspect call'));
    if (path.startsWith('/api/cache/keys')) return Promise.resolve(KEYS);
    throw new Error(`unexpected request: ${path}`);
  });
}

beforeEach(() => {
  mockApiRequest.mockReset();
});

describe('Admin cache page', () => {
  it('loads and renders the cache status and keys', async () => {
    mockDefaultResponses();
    renderPage();

    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(screen.getByText('exam:2024:00001')).toBeInTheDocument();
    expect(screen.getByText('result:abc123')).toBeInTheDocument();
    expect(requestedUrls()).toEqual(
      expect.arrayContaining(['/api/cache/status', '/api/cache/keys?page=1&pageSize=20']),
    );
  });

  it('is axe-clean once loaded', async () => {
    mockDefaultResponses();
    const { container } = renderPage();
    await screen.findByText('exam:2024:00001');

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('shows a status load error with a retry action', async () => {
    mockApiRequest.mockImplementation((path: string) => {
      if (path.startsWith('/api/cache/status')) return Promise.reject(new Error('boom'));
      return Promise.resolve(KEYS);
    });
    renderPage();

    expect(await screen.findByText('Could not load the cache status. Please try again.')).toBeInTheDocument();
  });

  it('shows an empty state when no keys match', async () => {
    mockApiRequest.mockImplementation((path: string) => {
      if (path.startsWith('/api/cache/status')) return Promise.resolve(STATUS);
      return Promise.resolve({ keys: [], total: 0, page: 1, pageSize: 20 });
    });
    renderPage();

    expect(await screen.findByText('No cached keys match this filter')).toBeInTheDocument();
  });

  it('shows an inline out-of-scope error for a disallowed pattern', async () => {
    const user = userEvent.setup();
    mockDefaultResponses();
    renderPage();
    await screen.findByText('exam:2024:00001');

    mockApiRequest.mockImplementation((path: string) => {
      if (path.startsWith('/api/cache/status')) return Promise.resolve(STATUS);
      if (path.includes('pattern=bull'))
        return Promise.reject(
          new ApiClientError('CACHE_KEY_OUT_OF_SCOPE', 'Only exam:/result: keys are visible here.'),
        );
      return Promise.resolve(KEYS);
    });

    await user.type(screen.getByLabelText('Pattern'), 'bull:*');

    expect(await screen.findByText('Only exam:/result: keys are visible here.')).toBeInTheDocument();
  });

  it('debounces the pattern filter and resets to page 1', async () => {
    const user = userEvent.setup();
    mockDefaultResponses();
    renderPage();
    await screen.findByText('exam:2024:00001');
    mockApiRequest.mockClear();
    mockDefaultResponses();

    await user.type(screen.getByLabelText('Pattern'), 'exam:2024:*');

    await waitFor(() => {
      expect(lastRequestedUrl('/api/cache/keys')).toBe('/api/cache/keys?page=1&pageSize=20&pattern=exam%3A2024%3A*');
    });
  });

  it('paginates with Previous disabled on page 1 and Next requesting page 2', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockImplementation((path: string) => {
      if (path.startsWith('/api/cache/status')) return Promise.resolve(STATUS);
      return Promise.resolve({ ...KEYS, total: 100 });
    });
    renderPage();
    await screen.findByText('exam:2024:00001');

    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();
    expect(screen.getByText('Page 1 of 5')).toBeInTheDocument();

    mockApiRequest.mockClear();
    mockApiRequest.mockImplementation((path: string) => {
      if (path.startsWith('/api/cache/status')) return Promise.resolve(STATUS);
      return Promise.resolve({ ...KEYS, page: 2, total: 100 });
    });
    await user.click(screen.getByRole('button', { name: /Next/ }));

    await waitFor(() => {
      expect(lastRequestedUrl('/api/cache/keys')).toBe('/api/cache/keys?page=2&pageSize=20');
    });
    expect(await screen.findByText('Page 2 of 5')).toBeInTheDocument();
  });

  it('inspects a key on demand and renders its value, then collapses on toggle', async () => {
    const user = userEvent.setup();
    const inspectResult: CacheKeyInspectResult = { key: 'result:abc123', ttl: 300, value: { examNo: '00001' } };
    mockApiRequest.mockImplementation((path: string) => {
      if (path.startsWith('/api/cache/status')) return Promise.resolve(STATUS);
      if (path === '/api/cache/keys/result%3Aabc123') return Promise.resolve(inspectResult);
      if (path.startsWith('/api/cache/keys')) return Promise.resolve(KEYS);
      throw new Error(`unexpected request: ${path}`);
    });
    renderPage();
    await screen.findByText('result:abc123');

    const resultRow = screen.getByText('result:abc123').closest('tr');
    if (!resultRow) throw new Error('row not found');
    await user.click(within(resultRow).getByRole('button', { name: 'Inspect' }));

    expect(await screen.findByText(/"examNo": "00001"/)).toBeInTheDocument();

    await user.click(within(resultRow).getByRole('button', { name: 'Inspect' }));
    expect(screen.queryByText(/"examNo": "00001"/)).not.toBeInTheDocument();
  });

  it('shows a not-found message when inspecting an already-expired key', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockImplementation((path: string) => {
      if (path.startsWith('/api/cache/status')) return Promise.resolve(STATUS);
      if (path === '/api/cache/keys/result%3Aabc123')
        return Promise.reject(new ApiClientError('CACHE_KEY_NOT_FOUND', 'not found'));
      if (path.startsWith('/api/cache/keys')) return Promise.resolve(KEYS);
      throw new Error(`unexpected request: ${path}`);
    });
    renderPage();
    await screen.findByText('result:abc123');

    const resultRow = screen.getByText('result:abc123').closest('tr');
    if (!resultRow) throw new Error('row not found');
    await user.click(within(resultRow).getByRole('button', { name: 'Inspect' }));

    expect(await screen.findByText('This key has already expired.')).toBeInTheDocument();
  });

  it('invalidates a single key via its dialog and reloads status and keys', async () => {
    const user = userEvent.setup();
    mockDefaultResponses();
    renderPage();
    await screen.findByText('result:abc123');
    mockApiRequest.mockClear();
    mockApiRequest.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'DELETE') return Promise.resolve({ deleted: true });
      if (path.startsWith('/api/cache/status')) return Promise.resolve(STATUS);
      return Promise.resolve(KEYS);
    });

    const resultRow = screen.getByText('result:abc123').closest('tr');
    if (!resultRow) throw new Error('row not found');
    await user.click(within(resultRow).getByRole('button', { name: 'Invalidate' }));

    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Invalidate' }));

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/cache/keys/result%3Aabc123',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('flushes the whole result cache via the top action and shows a success notice', async () => {
    const user = userEvent.setup();
    mockDefaultResponses();
    renderPage();
    await screen.findByText('result:abc123');
    mockApiRequest.mockClear();
    mockApiRequest.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'POST') return Promise.resolve({ deletedCount: 3 });
      if (path.startsWith('/api/cache/status')) return Promise.resolve(STATUS);
      return Promise.resolve(KEYS);
    });

    await user.click(screen.getByRole('button', { name: 'Flush result cache' }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Flush' }));

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/cache/flush',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({}) }),
      );
    });
    expect(await screen.findByText('Cache flushed — 3 keys cleared.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
