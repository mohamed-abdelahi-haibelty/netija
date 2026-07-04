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
  const switcherLabel = currentLocale === 'ar' ? 'تبديل اللغة' : 'Changer de langue';

  return (
    <nav aria-label={switcherLabel}>
      <Link
        href={newPath}
        hrefLang={otherLocale}
        lang={otherLocale}
        className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
      >
        {label}
      </Link>
    </nav>
  );
}
