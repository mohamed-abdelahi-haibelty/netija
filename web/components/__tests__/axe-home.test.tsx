import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { I18nProvider } from '@/components/I18nProvider';
import { SearchTabs } from '@/components/SearchTabs';
import { ExamTypeSwitcher } from '@/components/ExamTypeSwitcher';

expect.extend(toHaveNoViolations);

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/fr',
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

const MOCK_SUGGESTIONS = {
  suggestions: [
    {
      slug: 'abc123',
      examType: 'bac' as const,
      examYear: 2024,
      examNo: '00123',
      nameFr: 'Ahmed Ould Mohamed',
      nameAr: 'أحمد ولد محمد',
      serie: 'SN',
    },
    {
      slug: 'def456',
      examType: 'bac' as const,
      examYear: 2023,
      examNo: '00456',
      nameFr: 'Fatimetou Mint Ahmed',
      nameAr: 'فاطمة منت أحمد',
      serie: 'LM',
    },
  ],
};

beforeEach(() => {
  mockApiRequest.mockReset();
  mockApiRequest.mockResolvedValue(MOCK_SUGGESTIONS);
});

describe('A11y — home page (ExamTypeSwitcher)', () => {
  it('is axe-clean in French locale', async () => {
    const { container } = render(
      <I18nProvider locale="fr">
        <ExamTypeSwitcher lang="fr" examType="bac" />
      </I18nProvider>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('is axe-clean in Arabic locale', async () => {
    const { container } = render(
      <I18nProvider locale="ar">
        <ExamTypeSwitcher lang="ar" examType="bac" />
      </I18nProvider>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('A11y — home page (SearchTabs, exam-number tab active)', () => {
  it('is axe-clean in French locale', async () => {
    const { container } = render(
      <I18nProvider locale="fr">
        <SearchTabs lang="fr" examType="bac" years={[2024, 2023]} />
      </I18nProvider>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('is axe-clean in Arabic locale', async () => {
    const { container } = render(
      <I18nProvider locale="ar">
        <SearchTabs lang="ar" examType="bac" years={[2024, 2023]} />
      </I18nProvider>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('A11y — home page (SearchTabs, name tab with listbox open)', () => {
  async function renderAndOpenListbox(locale: string) {
    const { container } = render(
      <I18nProvider locale={locale}>
        <SearchTabs lang={locale} examType="bac" years={[2024, 2023]} />
      </I18nProvider>,
    );

    const nameTab = screen.getByRole('tab', { name: locale === 'fr' ? 'Recherche par nom' : 'البحث بالاسم' });
    await userEvent.setup().click(nameTab);

    const input = screen.getByRole('combobox');
    await userEvent.setup().type(input, 'Ahmed');

    await screen.findByRole('listbox');

    return { container };
  }

  it('is axe-clean in French locale with listbox open', async () => {
    const { container } = await renderAndOpenListbox('fr');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('is axe-clean in Arabic locale with listbox open', async () => {
    const { container } = await renderAndOpenListbox('ar');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
