import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/components/I18nProvider';
import { NameAutocomplete } from '../NameAutocomplete';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
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

const mockRecordSearchAttempt = jest.fn<unknown, []>();
const mockTrackResultSearched = jest.fn<unknown, [string, { found: boolean }]>();
const mockTrackAutocompleteShown = jest.fn<unknown, [number, number]>();
const mockTrackAutocompleteEmpty = jest.fn<unknown, [number]>();
jest.mock('@/lib/analytics', () => ({
  recordSearchAttempt: () => mockRecordSearchAttempt(),
  trackResultSearched: (method: string, opts: { found: boolean }) =>
    mockTrackResultSearched(method, opts),
  trackAutocompleteShown: (count: number, queryLength: number) =>
    mockTrackAutocompleteShown(count, queryLength),
  trackAutocompleteEmpty: (queryLength: number) => mockTrackAutocompleteEmpty(queryLength),
}));

function renderAutocomplete() {
  return render(
    <I18nProvider locale="fr">
      <NameAutocomplete lang="fr" />
    </I18nProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('NameAutocomplete analytics wiring', () => {
  it('tracks autocomplete_shown with the hit count and query length once suggestions arrive', async () => {
    mockApiRequest.mockResolvedValue({
      suggestions: [
        { slug: 'a', examYear: 2024, examNo: '00001', nameFr: 'X', nameAr: null, serie: 'SN' },
        { slug: 'b', examYear: 2023, examNo: '00002', nameFr: 'Y', nameAr: null, serie: 'SN' },
      ],
    });
    const user = userEvent.setup();
    renderAutocomplete();

    await user.type(screen.getByRole('combobox'), 'moha');
    await waitFor(() => { expect(mockTrackAutocompleteShown).toHaveBeenCalled(); });

    expect(mockTrackAutocompleteShown).toHaveBeenCalledWith(2, 4);
    expect(mockTrackAutocompleteEmpty).not.toHaveBeenCalled();
  });

  it('tracks autocomplete_empty with the query length when no suggestions match', async () => {
    mockApiRequest.mockResolvedValue({ suggestions: [] });
    const user = userEvent.setup();
    renderAutocomplete();

    await user.type(screen.getByRole('combobox'), 'zzzz');
    await waitFor(() => { expect(mockTrackAutocompleteEmpty).toHaveBeenCalled(); });

    expect(mockTrackAutocompleteEmpty).toHaveBeenCalledWith(4);
    expect(mockTrackAutocompleteShown).not.toHaveBeenCalled();
  });

  it('records a search attempt and tracks result_searched({method: "name", found: true}) when a suggestion is picked', async () => {
    mockApiRequest.mockResolvedValue({
      suggestions: [
        { slug: 'abc123', examYear: 2024, examNo: '00001', nameFr: 'Mohamed', nameAr: null, serie: 'SN' },
      ],
    });
    const user = userEvent.setup();
    renderAutocomplete();

    await user.type(screen.getByRole('combobox'), 'moha');
    await waitFor(() => { expect(screen.getByRole('option')).toBeInTheDocument(); });

    await user.click(screen.getByRole('option'));

    expect(mockRecordSearchAttempt).toHaveBeenCalledTimes(1);
    expect(mockTrackResultSearched).toHaveBeenCalledWith('name', { found: true });
    expect(mockPush).toHaveBeenCalledWith('/fr/results/abc123');
  });
});
