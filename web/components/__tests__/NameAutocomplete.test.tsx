import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/components/I18nProvider';
import { NameAutocomplete } from '@/components/NameAutocomplete';
import { ApiClientError } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const mockApiRequest = jest.fn<Promise<unknown>, [string, RequestInit?]>();

jest.mock('@/lib/api', () => {
  class MockApiClientError extends Error {
    code: string;
    retryAfterSeconds?: number;
    constructor(code: string, message: string, retryAfterSeconds?: number) {
      super(message);
      this.code = code;
      this.retryAfterSeconds = retryAfterSeconds;
      this.name = 'ApiClientError';
    }
  }
  return {
    apiRequest: (path: string, options?: RequestInit) => mockApiRequest(path, options),
    ApiClientError: MockApiClientError,
    DEFAULT_RATE_LIMIT_RETRY_SECONDS: 60,
  };
});

function renderAutocomplete() {
  return render(
    <I18nProvider locale="fr">
      <NameAutocomplete lang="fr" />
    </I18nProvider>,
  );
}

beforeEach(() => {
  mockApiRequest.mockReset();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('NameAutocomplete — rate limited state', () => {
  it('shows the rate-limited message with the countdown and stops issuing further requests while cooling down', async () => {
    mockApiRequest.mockRejectedValue(new ApiClientError('RATE_LIMITED', 'Too many requests.', 5));

    const user = userEvent.setup({ delay: null });
    renderAutocomplete();

    await user.type(screen.getByRole('combobox'), 'ahmed');
    await act(async () => { await jest.advanceTimersByTimeAsync(300); }); // clears the search debounce

    expect(await screen.findByText(/5s/)).toBeInTheDocument();
    expect(mockApiRequest).toHaveBeenCalledTimes(1);

    // A further keystroke would normally re-debounce and re-fetch — while
    // still cooling down, fetchSuggestions must short-circuit instead.
    await user.type(screen.getByRole('combobox'), 'm');
    await act(async () => { await jest.advanceTimersByTimeAsync(300); });

    expect(mockApiRequest).toHaveBeenCalledTimes(1);
  });
});
