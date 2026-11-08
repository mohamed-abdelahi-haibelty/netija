import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import TeamPage, { generateMetadata } from '../page';

expect.extend(toHaveNoViolations);

async function renderTeamPage(lang: 'ar' | 'fr') {
  const jsx = await TeamPage({ params: Promise.resolve({ lang }) });
  return render(jsx);
}

describe('TeamPage', () => {
  it('renders accessible content for Arabic locale', async () => {
    const { container } = await renderTeamPage('ar');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('renders accessible content for French locale', async () => {
    const { container } = await renderTeamPage('fr');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('lists all three members with a LinkedIn link each, in French', async () => {
    await renderTeamPage('fr');
    expect(screen.getByText('Mohamed Abdellahi Haibetty')).toBeInTheDocument();
    expect(screen.getByText('Développeur logiciel (front-end & back-end)')).toBeInTheDocument();
    expect(screen.getByText('Lalla Haibetty')).toBeInTheDocument();
    expect(screen.getByText('Baba Saleh Mahfoudh')).toBeInTheDocument();

    const links = screen.getAllByRole('link', { name: /LinkedIn/ });
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/mohamed-abdellahi-haibelti/',
    );
    links.forEach((link) => {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('shows Arabic names and roles for the Arabic locale', async () => {
    await renderTeamPage('ar');
    expect(screen.getByText('محمد عبد الله حيبلتي')).toBeInTheDocument();
    expect(screen.getByText('مطوّر برمجيات (الواجهة والخادم)')).toBeInTheDocument();
  });

  it('shows a TikTok link only for the one member who has one', async () => {
    await renderTeamPage('fr');

    const tiktokLinks = screen.getAllByRole('link', { name: /TikTok/ });
    expect(tiktokLinks).toHaveLength(1);
    expect(tiktokLinks[0]).toHaveAttribute('href', 'https://www.tiktok.com/@mohamedabdelahi33');
    expect(tiktokLinks[0]).toHaveAttribute('target', '_blank');
    expect(tiktokLinks[0]).toHaveAttribute('rel', 'noopener noreferrer');

    // Still exactly one LinkedIn link per member — TikTok is additive, not
    // a replacement.
    expect(screen.getAllByRole('link', { name: /LinkedIn/ })).toHaveLength(3);
  });

  it('is indexable, unlike result pages', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ lang: 'ar' }) });
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });
});
