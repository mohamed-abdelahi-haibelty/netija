import { mockApiModule as mockCreateApiModule } from '@/lib/testUtils/mockApi';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestI18nProvider as I18nProvider } from '@/lib/testUtils/i18n';
import { HomeSearchSection } from '@/components/HomeSearchSection';

const mockUseSearchParams = jest.fn<URLSearchParams, []>();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => mockUseSearchParams(),
}));

const mockApiRequest = jest.fn<Promise<unknown>, [string, RequestInit?]>();
jest.mock('@/lib/api', () => ({
  ...mockCreateApiModule(true),
  apiRequest: (path: string, options?: RequestInit) => mockApiRequest(path, options),
}));

const YEARS_BY_TYPE = {
  bac: { years: [2024, 2023], error: false },
  brevet: { years: [2022], error: false },
};

function renderSection() {
  return render(
    <I18nProvider locale="fr">
      <HomeSearchSection lang="fr" yearsByType={YEARS_BY_TYPE} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  mockApiRequest.mockReset();
  mockUseSearchParams.mockReturnValue(new URLSearchParams());
});

describe('HomeSearchSection', () => {
  it('defaults to bac (and its years) with no ?type= present', () => {
    renderSection();

    expect(screen.getByRole('button', { name: 'Bac', pressed: true })).toBeInTheDocument();
    expect(screen.getByText('2024')).toBeInTheDocument();
  });

  it('shows the brevet tab (and its years) when ?type=brevet', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('type=brevet'));

    renderSection();

    expect(screen.getByRole('button', { name: 'Brevet (BEPC)', pressed: true })).toBeInTheDocument();
  });

  it('falls back to bac for an invalid ?type= value', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('type=nonsense'));

    renderSection();

    expect(screen.getByRole('button', { name: 'Bac', pressed: true })).toBeInTheDocument();
  });

  // Regression test for the intermittent bug: after a hard refresh with
  // ?type=brevet in the URL, clicking the other tab (Bac) sometimes did
  // nothing, because the tab was driven by re-reading useSearchParams()
  // rather than by state. This asserts the click switches immediately even
  // though useSearchParams() never changes after the initial render (it
  // can't — it's only read once, into state).
  it('switches tabs on click even though useSearchParams keeps returning the initial value', async () => {
    const user = userEvent.setup();
    const replaceStateSpy = jest.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    mockUseSearchParams.mockReturnValue(new URLSearchParams('type=brevet'));

    renderSection();
    expect(screen.getByRole('button', { name: 'Brevet (BEPC)', pressed: true })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Bac' }));

    expect(screen.getByRole('button', { name: 'Bac', pressed: true })).toBeInTheDocument();
    expect(screen.getByText('2024')).toBeInTheDocument();
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/fr?type=bac');

    replaceStateSpy.mockRestore();
  });
});
