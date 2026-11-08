'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';

interface Props {
  lang: string;
}

// Netija's official Facebook page — a site-wide constant (not per-locale
// team data) since there's exactly one, unlike team members' individual
// profile links on /team.
const FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=100094427925918';

// Quiet document-footer, matching the flat Notion vocabulary: a single
// hairline, muted small text, no card/background. Present on every public
// page (mounted once in [lang]/layout.tsx) so /privacy and /team are always
// reachable, per the design system's "one flat canvas" rule.
export function Footer({ lang }: Props) {
  const { t } = useTranslation();

  return (
    <footer className="mt-auto border-t border-border">
      <nav
        aria-label={t('footer.navLabel')}
        className="mx-auto flex max-w-140 gap-4 px-6 py-6 text-xs text-muted-foreground"
      >
        <Link
          href={`/${lang}/privacy`}
          className="hover:text-foreground transition-colors duration-150"
        >
          {t('footer.privacyLink')}
        </Link>
        <Link
          href={`/${lang}/team`}
          className="hover:text-foreground transition-colors duration-150"
        >
          {t('footer.teamLink')}
        </Link>
        <a
          href={FACEBOOK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors duration-150"
        >
          {t('footer.facebookLink')}
        </a>
      </nav>
    </footer>
  );
}
