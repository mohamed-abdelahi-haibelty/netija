import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/components/I18nProvider';
import { SearchTabs } from '../SearchTabs';

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
const mockTrackResultSearched = jest.fn<unknown, [string]>();
jest.mock('@/lib/analytics', () => ({
  recordSearchAttempt: () => mockRecordSearchAttempt(),
  trackResultSearched: (method: string) => mockTrackResultSearched(method),
}));

function renderTabs() {
  return render(
    <I18nProvider locale="fr">
      <SearchTabs lang="fr" years={[2024, 2023]} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SearchTabs exam search analytics wiring', () => {
  it('records a search attempt and tracks result_searched({method: "examNo"}) on submit', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue({ slug: 'abc123' });
    renderTabs();

    await user.type(screen.getByRole('textbox', { name: "Numéro d'examen" }), '00573');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));

    expect(mockRecordSearchAttempt).toHaveBeenCalledTimes(1);
    expect(mockTrackResultSearched).toHaveBeenCalledWith('examNo');
  });
});
