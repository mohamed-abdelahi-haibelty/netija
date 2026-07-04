import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { I18nProvider } from '@/components/I18nProvider';
import { ApiClientError } from '@/lib/api';
import ImportDetailPage from '../page';
import type { ImportStatusResult } from 'shared';

expect.extend(toHaveNoViolations);

jest.mock('next/navigation', () => ({
  useParams: () => ({ lang: 'fr', importId: '42' }),
}));

const mockTrackAdminPublish = jest.fn<unknown, [string]>();
jest.mock('@/lib/analytics', () => ({
  trackAdminPublish: (action: string) => mockTrackAdminPublish(action),
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
  status: 'completed',
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
  mockTrackAdminPublish.mockClear();
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
    expect(mockTrackAdminPublish).toHaveBeenCalledWith('publish');
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
    expect(mockTrackAdminPublish).toHaveBeenCalledWith('unpublish');
  });

  it('shows no publish controls before the import has completed', async () => {
    mockApiRequest.mockResolvedValue({
      status: 'processing',
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
});
