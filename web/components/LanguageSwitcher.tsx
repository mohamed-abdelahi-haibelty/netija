'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { locales, type Locale } from '@/lib/i18n/settings';

interface Props {
  currentLocale: Locale;
}

export function LanguageSwitcher({ currentLocale }: Props) {
  const pathname = usePathname();
  const otherLocale = locales.find((l) => l !== currentLocale);
  if (!otherLocale) return null;

  const newPath = pathname.replace(
    new RegExp(`^/${currentLocale}(/|$)`),
    `/${otherLocale}$1`,
  );

  const label = otherLocale === 'ar' ? 'العربية' : 'Français';

  return (
    <nav aria-label="Language switcher">
      <Link href={newPath} hrefLang={otherLocale} lang={otherLocale}>
        {label}
      </Link>
    </nav>
  );
}
