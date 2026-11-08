import { render, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { TestI18nProvider as I18nProvider } from '@/lib/testUtils/i18n';
import AdminLoginPage from '../page';

expect.extend(toHaveNoViolations);

const mockUseSearchParams = jest.fn<URLSearchParams, []>();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({ lang: 'fr' }),
  useSearchParams: () => mockUseSearchParams(),
}));

const mockTrackAdminAccessAttempt = jest.fn<unknown, [string]>();
jest.mock('@/lib/analytics', () => ({
  trackAdminAccessAttempt: (route: string) => mockTrackAdminAccessAttempt(route),
}));

function renderPage(locale: 'ar' | 'fr' = 'fr') {
  return render(
    <I18nProvider locale={locale}>
      <AdminLoginPage />
    </I18nProvider>,
  );
}

beforeEach(() => {
  mockTrackAdminAccessAttempt.mockClear();
  mockUseSearchParams.mockReturnValue(new URLSearchParams());
});

describe('A11y — admin login page', () => {
  it('is axe-clean in French locale', async () => {
    const { container } = renderPage('fr');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('is axe-clean in Arabic locale', async () => {
    const { container } = renderPage('ar');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('Admin login page — admin_access_attempt reporting', () => {
  it('tracks admin_access_attempt with the blocked route pattern when redirected here', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('blocked=%2Fadmin%2Fimports%2F%5Bid%5D'),
    );

    renderPage();

    await waitFor(() => {
      expect(mockTrackAdminAccessAttempt).toHaveBeenCalledWith('/admin/imports/[id]');
    });
  });

  it('never tracks admin_access_attempt on a plain, non-redirected visit', () => {
    renderPage();

    expect(mockTrackAdminAccessAttempt).not.toHaveBeenCalled();
  });
});
