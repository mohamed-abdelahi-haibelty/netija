import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import PrivacyPage, { generateMetadata } from '../page';

expect.extend(toHaveNoViolations);

async function renderPrivacyPage(lang: 'ar' | 'fr') {
  const jsx = await PrivacyPage({ params: Promise.resolve({ lang }) });
  return render(jsx);
}

describe('PrivacyPage', () => {
  it('renders accessible content for Arabic locale', async () => {
    const { container } = await renderPrivacyPage('ar');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('renders accessible content for French locale', async () => {
    const { container } = await renderPrivacyPage('fr');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('renders a single h1 and the storage list for French', async () => {
    await renderPrivacyPage('fr');
    expect(screen.getByRole('heading', { level: 1, name: /Netija/ })).toBeInTheDocument();
    expect(screen.getByText("le numéro d'examen")).toBeInTheDocument();
    expect(screen.getByText('la série (Bac uniquement)')).toBeInTheDocument();
  });

  it('renders the storage list for Arabic', async () => {
    await renderPrivacyPage('ar');
    expect(screen.getByText('رقم الامتحان')).toBeInTheDocument();
    expect(screen.getByText('الشعبة (للباكالوريا فقط)')).toBeInTheDocument();
  });

  it('never mentions free access or registration, per positioning guidance', async () => {
    await renderPrivacyPage('ar');
    expect(screen.queryByText(/مجان/)).not.toBeInTheDocument();
    expect(screen.queryByText(/تسجيل/)).not.toBeInTheDocument();
  });

  it('is indexable, unlike result pages', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ lang: 'fr' }) });
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });
});
