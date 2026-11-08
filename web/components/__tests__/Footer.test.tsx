import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { TestI18nProvider as I18nProvider } from '@/lib/testUtils/i18n';
import { Footer } from '@/components/Footer';

expect.extend(toHaveNoViolations);

function renderFooter(locale: 'ar' | 'fr') {
  return render(
    <I18nProvider locale={locale}>
      <Footer lang={locale} />
    </I18nProvider>,
  );
}

describe('Footer', () => {
  it('renders accessible footer nav for Arabic locale', async () => {
    const { container } = renderFooter('ar');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('renders accessible footer nav for French locale', async () => {
    const { container } = renderFooter('fr');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('links to the locale-scoped privacy and team pages', () => {
    renderFooter('fr');
    expect(screen.getByRole('link', { name: 'Confidentialité & données' })).toHaveAttribute(
      'href',
      '/fr/privacy',
    );
    expect(screen.getByRole('link', { name: "L'équipe" })).toHaveAttribute('href', '/fr/team');
  });

  it('links to the Arabic-scoped privacy and team pages', () => {
    renderFooter('ar');
    expect(screen.getByRole('link', { name: 'الخصوصية والبيانات' })).toHaveAttribute(
      'href',
      '/ar/privacy',
    );
    expect(screen.getByRole('link', { name: 'الفريق' })).toHaveAttribute('href', '/ar/team');
  });

  it('links to the Netija Facebook page, opened in a new tab', () => {
    renderFooter('fr');
    const link = screen.getByRole('link', { name: 'Facebook' });
    expect(link).toHaveAttribute(
      'href',
      'https://www.facebook.com/profile.php?id=100094427925918',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
