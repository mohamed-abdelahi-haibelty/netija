/**
 * Accessibility tests for the shell layout in both locales.
 * Uses jest-axe to ensure zero WCAG violations.
 */
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

expect.extend(toHaveNoViolations);

jest.mock('next/navigation', () => ({
  usePathname: () => '/ar',
}));

describe('LanguageSwitcher', () => {
  it('renders accessible language switcher nav for Arabic locale', async () => {
    const { container } = render(<LanguageSwitcher currentLocale="ar" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('renders accessible language switcher nav for French locale', async () => {
    const { container } = render(<LanguageSwitcher currentLocale="fr" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('shows French label when current locale is Arabic', () => {
    const { getByRole } = render(<LanguageSwitcher currentLocale="ar" />);
    const link = getByRole('link');
    expect(link).toHaveAttribute('hrefLang', 'fr');
    expect(link).toHaveAttribute('lang', 'fr');
  });

  it('shows Arabic label when current locale is French', () => {
    const { getByRole } = render(<LanguageSwitcher currentLocale="fr" />);
    const link = getByRole('link');
    expect(link).toHaveAttribute('hrefLang', 'ar');
    expect(link).toHaveAttribute('lang', 'ar');
  });

  it('preserves the current page path when switching from Arabic to French', () => {
    const { getByRole } = render(<LanguageSwitcher currentLocale="ar" />);
    const link = getByRole('link');
    expect(link).toHaveAttribute('href', '/fr');
  });
});
