import { mockApiModule as mockCreateApiModule } from '@/lib/testUtils/mockApi';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/components/I18nProvider';
import { SearchTabs } from '@/components/SearchTabs';
import { ApiClientError } from '@/lib/api';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

const mockApiRequest = jest.fn<Promise<unknown>, [string, RequestInit?]>();

jest.mock('@/lib/api', () => ({
  ...mockCreateApiModule(true),
  apiRequest: (path: string, options?: RequestInit) => mockApiRequest(path, options),
}));

function renderTabs() {
  return render(
    <I18nProvider locale="fr">
      <SearchTabs lang="fr" examType="bac" years={[2024, 2023]} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  mockApiRequest.mockReset();
});

describe('SearchTabs — rate limited state', () => {
  it('shows the rate-limited message with the server-provided countdown and disables re-submission', async () => {
    mockApiRequest.mockRejectedValue(new ApiClientError('RATE_LIMITED', 'Too many requests.', 3));

    const user = userEvent.setup();
    renderTabs();

    await user.type(screen.getByPlaceholderText("Entrez votre numéro d'examen"), '00123');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Trop de recherches/);
    expect(screen.getByText(/3s/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rechercher' })).toBeDisabled();
  });

  it('falls back to the default retry window when the server omits Retry-After', async () => {
    mockApiRequest.mockRejectedValue(new ApiClientError('RATE_LIMITED', 'Too many requests.'));

    const user = userEvent.setup();
    renderTabs();

    await user.type(screen.getByPlaceholderText("Entrez votre numéro d'examen"), '00123');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Trop de recherches/);
    expect(screen.getByText(/60s/)).toBeInTheDocument();
  });
});
